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
  const existing = await prisma.weeklySetting.findFirst({
    where: { propertyId, group: "metricool", key },
    select: { id: true },
  });
  const value = result as unknown as object;
  if (existing) {
    await prisma.weeklySetting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.weeklySetting.create({ data: { propertyId, group: "metricool", key, value } });
  }
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

      if (metricoolConfigured) {
        const blogId = await getPropertyBlogId(prop.code);
        if (blogId) {
          try {
            const res = await syncMetricoolIntoReport(report.id, prop.code);
            r.metricoolRows = res.rows;
            await storeSyncMeta(prop.id, week, res);
          } catch (e) {
            r.errors.push(`metricool: ${msg(e)}`);
          }
        }
      }

      if (adsConfigured) {
        try {
          const res = await syncAdsIntoReport(report.id, prop.code);
          r.adsRows = res.rows;
        } catch (e) {
          r.errors.push(`ads: ${msg(e)}`);
        }
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
