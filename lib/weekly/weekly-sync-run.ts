/**
 * Weekly auto-sync runner. Pulls Metricool (and ads, when configured) for every
 * property's current reporting week, creating the week's DRAFT report if it
 * doesn't exist yet. Designed to run unattended on a schedule (see
 * app/api/cron/weekly-sync), so it is resilient: one property's failure never
 * aborts the others, and a locked (approved/exported) report is left untouched.
 *
 * "Current week" is the most recent Fri–Thu span whose Thursday has passed
 * (currentWeekId). Run it Friday morning and it fills the week that just ended.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isAdsSyncConfigured, syncAdsIntoReport } from "@/lib/weekly/ads-sync";
import { isLockedStatus } from "@/lib/weekly/editor-data";
import { enqueueWeeklyScrapeJobs, isScrapeQueueConfigured } from "@/lib/weekly/jobs";
import { getPropertyBlogId, isMetricoolConfigured } from "@/lib/weekly/metricool";
import { syncMetricoolIntoReport, type MetricoolSyncResult } from "@/lib/weekly/metricool-sync";
import { syncOwnerChannelMixIntoReport } from "@/lib/weekly/owner-channel-mix-sync";
import { currentWeekId, weekMeta } from "@/lib/weekly/week";

export interface WeeklyAutoSyncPropertyResult {
  property: string;
  created: boolean;
  skippedLocked: boolean;
  metricoolRows: number | null;
  adsRows: number | null;
  /** Section codes whose VHP scrape job was queued for the poller (B / C). */
  scrapeQueued: string[];
  errors: string[];
}

export interface WeeklyAutoSyncResult {
  week: string;
  ranAt: string;
  metricoolConfigured: boolean;
  adsConfigured: boolean;
  scrapeQueueConfigured: boolean;
  results: WeeklyAutoSyncPropertyResult[];
}

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Persist the Metricool sync diagnostic (so the preview + Excel note show it). */
async function storeSyncMeta(propertyId: string, week: string, result: MetricoolSyncResult) {
  const key = `sync_${week}`;
  const value = result as unknown as object;
  // Atomic upsert on the (propertyId, group, key) unique key — so a manual
  // create coinciding with the Friday cron (both the first write for this
  // week) resolves as an update rather than raising a spurious P2002.
  await prisma.weeklySetting.upsert({
    where: { propertyId_group_key: { propertyId, group: "metricool", key } },
    create: { propertyId, group: "metricool", key, value },
    update: { value },
  });
}

export interface ReportSyncOutcome {
  metricoolRows: number | null;
  adsRows: number | null;
  errors: string[];
}

/**
 * Carry the manually-entered grids forward from the most recent PRIOR report of
 * the same property, so a new week opens with the previous week's data already
 * in place and the team only updates the latest month (instead of re-typing a
 * year of history). Covers the three per-week manual sections:
 *   - Owner Overview "Repeater Guest" (WeeklyOwnerRepeater)
 *   - Owner Overview "Channel Mix" (WeeklyOwnerChannelMix)
 *   - Sections E/F "Channel Inside" room nights (WeeklyChannelRn)
 *
 * Idempotent and non-destructive: a section is only seeded when the NEW report
 * currently has zero rows in it, so re-runs and reports with existing manual
 * data are never clobbered. Best-effort — never throws, so it can't block
 * report creation. No schema change (these stay per-week snapshots).
 */
export async function carryForwardManualSections(
  newReportId: string,
  propertyId: string,
  newStartDate: Date,
): Promise<void> {
  try {
    const prior = await prisma.weeklyReport.findFirst({
      where: { propertyId, startDate: { lt: newStartDate } },
      orderBy: { startDate: "desc" },
      include: {
        ownerRepeaters: { orderBy: { sortOrder: "asc" } },
        ownerChannelMix: { orderBy: { sortOrder: "asc" } },
        channelRns: { orderBy: [{ year: "asc" }, { sortOrder: "asc" }] },
      },
    });
    if (!prior) return; // first-ever report for this property

    const [repCount, mixCount, chanCount] = await Promise.all([
      prisma.weeklyOwnerRepeater.count({ where: { reportWeekId: newReportId } }),
      prisma.weeklyOwnerChannelMix.count({ where: { reportWeekId: newReportId } }),
      prisma.weeklyChannelRn.count({ where: { reportWeekId: newReportId } }),
    ]);

    const writes: Promise<unknown>[] = [];
    if (repCount === 0 && prior.ownerRepeaters.length > 0) {
      writes.push(
        prisma.weeklyOwnerRepeater.createMany({
          data: prior.ownerRepeaters.map((r) => ({
            reportWeekId: newReportId,
            label: r.label,
            roomNights: r.roomNights,
            revenue: r.revenue,
            sortOrder: r.sortOrder,
          })),
        }),
      );
    }
    if (mixCount === 0 && prior.ownerChannelMix.length > 0) {
      writes.push(
        prisma.weeklyOwnerChannelMix.createMany({
          data: prior.ownerChannelMix.map((r) => ({
            reportWeekId: newReportId,
            label: r.label,
            rnSold: r.rnSold,
            grossRevenue: r.grossRevenue,
            sortOrder: r.sortOrder,
          })),
        }),
      );
    }
    if (chanCount === 0 && prior.channelRns.length > 0) {
      writes.push(
        prisma.weeklyChannelRn.createMany({
          data: prior.channelRns.map((r) => ({
            reportWeekId: newReportId,
            year: r.year,
            sourceLabel: r.sourceLabel,
            jan: r.jan, feb: r.feb, mar: r.mar, apr: r.apr, may: r.may, jun: r.jun,
            jul: r.jul, aug: r.aug, sep: r.sep, oct: r.oct, nov: r.nov, dec: r.dec,
            sortOrder: r.sortOrder,
          })),
        }),
      );
    }
    await Promise.all(writes);
  } catch {
    // best-effort: carry-forward must never block report creation
  }
}

/**
 * Best-effort pull of Metricool + ads into a single report, run in parallel.
 * Never throws: each source is independently guarded, so one failing (or a
 * missing brand / unset key) never aborts the other or the caller. Shared by
 * the scheduled auto-sync and the manual "create week" action, so a report
 * comes pre-populated the same way however it was created.
 */
export async function syncReportSources(
  reportId: string,
  propertyId: string,
  propertyCode: string,
  week: string,
  opts: { metricoolConfigured?: boolean; adsConfigured?: boolean } = {},
): Promise<ReportSyncOutcome> {
  const metricoolConfigured = opts.metricoolConfigured ?? isMetricoolConfigured();
  const adsConfigured = opts.adsConfigured ?? isAdsSyncConfigured();
  const out: ReportSyncOutcome = { metricoolRows: null, adsRows: null, errors: [] };

  const tasks: Promise<void>[] = [];

  if (metricoolConfigured) {
    tasks.push(
      (async () => {
        try {
          // Inside the try so a thrown blogId lookup (e.g. a transient DB error)
          // is recorded as a metricool error rather than silently swallowed; a
          // genuinely unassigned brand returns null and is skipped quietly.
          const blogId = await getPropertyBlogId(propertyCode);
          if (!blogId) return;
          const res = await syncMetricoolIntoReport(reportId, propertyCode);
          out.metricoolRows = res.rows;
          await storeSyncMeta(propertyId, week, res);
        } catch (e) {
          out.errors.push(`metricool: ${msg(e)}`);
        }
      })(),
    );
  }

  if (adsConfigured) {
    tasks.push(
      (async () => {
        try {
          const res = await syncAdsIntoReport(reportId, propertyCode);
          out.adsRows = res.rows;
        } catch (e) {
          out.errors.push(`ads: ${msg(e)}`);
        }
      })(),
    );
  }

  await Promise.all(tasks); // inner try/catch means this never rejects

  // Keep the owner Channel Mix in step with Section C whenever a report's data
  // is prepared (create / Friday run). No-op when Section C is empty, so it
  // never clobbers a carried-forward mix. Best-effort (never throws).
  await syncOwnerChannelMixIntoReport(reportId);

  return out;
}

/**
 * Run the weekly auto-sync for every property. `week` defaults to the current
 * reporting week (its Thursday end, yyyy-mm-dd).
 */
export async function runWeeklyAutoSync(opts: { week?: string } = {}): Promise<WeeklyAutoSyncResult> {
  const week = opts.week ?? currentWeekId();
  const meta = weekMeta(week);
  if (!meta) throw new Error(`Invalid week id: ${week}`);

  const metricoolConfigured = isMetricoolConfigured();
  const adsConfigured = isAdsSyncConfigured();
  const scrapeQueueConfigured = isScrapeQueueConfigured();

  const props = await prisma.property.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } });
  const results: WeeklyAutoSyncPropertyResult[] = [];

  for (const prop of props) {
    const r: WeeklyAutoSyncPropertyResult = {
      property: prop.code,
      created: false,
      skippedLocked: false,
      metricoolRows: null,
      adsRows: null,
      scrapeQueued: [],
      errors: [],
    };

    try {
      // Ensure the week's report exists (create a DRAFT if the team hasn't yet).
      let report = await prisma.weeklyReport.findFirst({
        where: { propertyId: prop.id, startDate: meta.startDate },
        select: { id: true, status: true },
      });
      if (!report) {
        report = await prisma.weeklyReport.create({
          data: {
            propertyId: prop.id,
            startDate: meta.startDate,
            endDate: meta.endDate,
            year: meta.year,
            weekNumber: meta.weekNumber,
            label: meta.label,
            status: "DRAFT",
          },
          select: { id: true, status: true },
        });
        r.created = true;
        // Seed the manual grids from the previous week so the team only updates
        // the latest month (best-effort; never blocks the sync).
        await carryForwardManualSections(report.id, prop.id, meta.startDate);
      }

      if (isLockedStatus(report.status)) {
        r.skippedLocked = true;
        results.push(r);
        continue;
      }

      const outcome = await syncReportSources(report.id, prop.id, prop.code, week, {
        metricoolConfigured,
        adsConfigured,
      });
      r.metricoolRows = outcome.metricoolRows;
      r.adsRows = outcome.adsRows;
      r.errors.push(...outcome.errors);

      // Queue the VHP scrape jobs (Sections B & C) so the office-PC poller fills
      // them automatically, the same trigger that pulls ads + social.
      if (scrapeQueueConfigured) {
        const q = await enqueueWeeklyScrapeJobs(prop.code, week);
        r.scrapeQueued = q.created;
      }
    } catch (e) {
      r.errors.push(msg(e));
    }

    results.push(r);
  }

  const out: WeeklyAutoSyncResult = {
    week,
    ranAt: new Date().toISOString(),
    metricoolConfigured,
    adsConfigured,
    scrapeQueueConfigured,
    results,
  };

  await logAudit("weekly_auto_sync", week, {
    results: results.map((x) => ({
      property: x.property,
      created: x.created,
      skippedLocked: x.skippedLocked,
      metricoolRows: x.metricoolRows,
      adsRows: x.adsRows,
      scrapeQueued: x.scrapeQueued,
      errors: x.errors,
    })),
  }).catch(() => {});

  return out;
}
