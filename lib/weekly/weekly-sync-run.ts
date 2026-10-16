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
import { getPropertyBlogId, isMetricoolConfigured } from "@/lib/weekly/metricool";
import { syncMetricoolIntoReport, type MetricoolSyncResult } from "@/lib/weekly/metricool-sync";
import { currentWeekId, weekMeta } from "@/lib/weekly/week";

export interface WeeklyAutoSyncPropertyResult {
  property: string;
  created: boolean;
  skippedLocked: boolean;
  metricoolRows: number | null;
  adsRows: number | null;
  errors: string[];
}

export interface WeeklyAutoSyncResult {
  week: string;
  ranAt: string;
  metricoolConfigured: boolean;
  adsConfigured: boolean;
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

  const props = await prisma.property.findMany({ select: { id: true, code: true }, orderBy: { code: "asc" } });
  const results: WeeklyAutoSyncPropertyResult[] = [];

  for (const prop of props) {
    const r: WeeklyAutoSyncPropertyResult = {
      property: prop.code,
      created: false,
      skippedLocked: false,
      metricoolRows: null,
      adsRows: null,
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
    results,
  };

  await logAudit("weekly_auto_sync", week, {
    results: results.map((x) => ({
      property: x.property,
      created: x.created,
      skippedLocked: x.skippedLocked,
      metricoolRows: x.metricoolRows,
      adsRows: x.adsRows,
      errors: x.errors,
    })),
  }).catch(() => {});

  return out;
}
