/**
 * Read/write the ScraperCheckRun history (the record of every scraper-health
 * check and what it alerted on). Every DB access is wrapped so the Scraper
 * Health page and the check still work if the migration hasn't been applied yet
 * (the table is just treated as empty — alert de-dup degrades to "alert each
 * run", which, on the once-a-day cron, still means one alert a day).
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export interface RescrapeRef {
  /** The gap key this re-scrape was for ("CODE:feed:date"). */
  key: string;
  /** The queued ScrapeJob id, or null when it was skipped. */
  jobId: string | null;
  /** Why it was skipped (e.g. "already queued", "queue not configured"). */
  skipped?: string;
}

export interface ScraperCheckRunView {
  id: string;
  trigger: string;
  dateWita: string;
  openGaps: string[];
  newGaps: string[];
  recovered: RescrapeRef[];
  emailSent: boolean;
  emailError: string | null;
  ranAt: string; // ISO
}

const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

function asRescrapeArr(v: unknown): RescrapeRef[] {
  if (!Array.isArray(v)) return [];
  const out: RescrapeRef[] = [];
  for (const it of v) {
    if (it && typeof it === "object" && !Array.isArray(it)) {
      const o = it as Record<string, unknown>;
      if (typeof o.key === "string") {
        out.push({
          key: o.key,
          jobId: typeof o.jobId === "string" ? o.jobId : null,
          skipped: typeof o.skipped === "string" ? o.skipped : undefined,
        });
      }
    }
  }
  return out;
}

interface RunRow {
  id: string;
  trigger: string;
  dateWita: string;
  openGaps: unknown;
  newGaps: unknown;
  recovered: unknown;
  emailSent: boolean;
  emailError: string | null;
  ranAt: Date;
}

function toView(r: RunRow): ScraperCheckRunView {
  return {
    id: r.id,
    trigger: r.trigger,
    dateWita: r.dateWita,
    openGaps: asStrArr(r.openGaps),
    newGaps: asStrArr(r.newGaps),
    recovered: asRescrapeArr(r.recovered),
    emailSent: r.emailSent,
    emailError: r.emailError,
    ranAt: r.ranAt.toISOString(),
  };
}

/** Recent check runs for the monitor (newest first). Empty if the table is missing. */
export async function getRecentCheckRuns(limit = 10): Promise<ScraperCheckRunView[]> {
  try {
    const rows = await prisma.scraperCheckRun.findMany({ orderBy: { ranAt: "desc" }, take: limit });
    return rows.map(toView);
  } catch {
    return [];
  }
}

/** The most recent run that evaluated `dateWita` (for new-gap de-dup). */
export async function getLatestCheckRunForDate(dateWita: string): Promise<ScraperCheckRunView | null> {
  try {
    const r = await prisma.scraperCheckRun.findFirst({ where: { dateWita }, orderBy: { ranAt: "desc" } });
    return r ? toView(r) : null;
  } catch {
    return null;
  }
}

/**
 * Gap keys that have ALREADY been successfully alerted on `dateWita` — the union
 * of `newGaps` across today's runs where the email actually sent. The de-dup
 * baseline: a gap is "new" (alert-worthy) until an alert for it has gone out, so
 * a failed send is retried on the next run instead of being silently suppressed.
 * Empty when the table is missing (so a gap still alerts).
 */
export async function getAlertedGapKeysForDate(dateWita: string): Promise<string[]> {
  try {
    const rows = await prisma.scraperCheckRun.findMany({
      where: { dateWita, emailSent: true },
      select: { newGaps: true },
    });
    const set = new Set<string>();
    for (const r of rows) for (const k of asStrArr(r.newGaps)) set.add(k);
    return [...set];
  } catch {
    return [];
  }
}

export interface RecordRunInput {
  trigger: string;
  dateWita: string;
  openGaps: string[];
  newGaps: string[];
  recovered: RescrapeRef[];
  emailSent: boolean;
  emailError: string | null;
}

/** Persist one check run. Best-effort — returns null if the table is missing. */
export async function recordCheckRun(input: RecordRunInput): Promise<ScraperCheckRunView | null> {
  try {
    const r = await prisma.scraperCheckRun.create({
      data: {
        trigger: input.trigger,
        dateWita: input.dateWita,
        openGaps: input.openGaps as unknown as Prisma.InputJsonValue,
        newGaps: input.newGaps as unknown as Prisma.InputJsonValue,
        recovered: input.recovered as unknown as Prisma.InputJsonValue,
        emailSent: input.emailSent,
        emailError: input.emailError,
      },
    });
    return toView(r);
  } catch {
    return null;
  }
}
