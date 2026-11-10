/**
 * Auto-recover: when a daily feed doesn't arrive, queue the office-PC scraper to
 * re-run that property's morning Daily Report pull. This reuses the existing
 * scrape-job queue with a new section "D" (one snapshot day). The whole morning
 * pull is a single VHP session that produces every daily feed, so ONE re-pull
 * per property covers all of its missing feeds.
 *
 * Gated by SCRAPER_AUTO_RECOVER (default OFF): queuing a "D" job only helps once
 * the office-PC poller knows how to run a daily re-pull from it (see
 * SCRAPER_MONITORING.md). Until then the check still records + emails the gap;
 * an admin can also queue a re-pull by hand from the Scraper Health page.
 */

import { isoToUtcDate } from "@/lib/daily/date";
import { buildDailyRescrapeInput } from "@/lib/monitor/health-logic";
import { prisma } from "@/lib/prisma";
import { createScrapeJob, isScrapeQueueConfigured } from "@/lib/weekly/jobs";

/** True when the scheduled check may auto-queue a daily re-pull on a missing feed. */
export function isAutoRecoverEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.SCRAPER_AUTO_RECOVER ?? "");
}

export interface RescrapeOutcome {
  /** Record key tying the re-pull to the property + day it covers. */
  key: string;
  /** The queued ScrapeJob id, or null when nothing was queued. */
  jobId: string | null;
  /** Why no new job was queued (skipped / already running / error). */
  skipped?: string;
}

/**
 * Queue a daily re-pull (ScrapeJob section "D") for one property + snapshot day.
 * Idempotent: if an unfinished "D" job for that property + date already exists,
 * it returns that job instead of stacking a duplicate. Never throws.
 */
export async function enqueueDailyRescrape(
  propertyCode: string,
  snapshotDateIso: string,
  requestedById: string | null = null,
): Promise<RescrapeOutcome> {
  const code = propertyCode.trim().toUpperCase();
  const key = `${code}:daily:${snapshotDateIso}`;

  if (!isScrapeQueueConfigured()) {
    return { key, jobId: null, skipped: "scrape queue not configured" };
  }

  try {
    const existing = await prisma.scrapeJob.findFirst({
      where: {
        property: code,
        section: "D",
        startDate: isoToUtcDate(snapshotDateIso),
        status: { in: ["queued", "running"] },
      },
      select: { id: true },
    });
    if (existing) return { key, jobId: existing.id, skipped: "already queued" };

    const input = buildDailyRescrapeInput(code, snapshotDateIso);
    const res = await createScrapeJob({ ...input, requestedById });
    return res.ok ? { key, jobId: res.id } : { key, jobId: null, skipped: res.error };
  } catch (e) {
    return { key, jobId: null, skipped: e instanceof Error ? e.message : "enqueue failed" };
  }
}
