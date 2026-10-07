"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { AD_PLATFORMS, adsRevenueField } from "@/lib/weekly/ads";
import { isAdsSyncConfigured, syncAdsIntoReport } from "@/lib/weekly/ads-sync";
import { isLockedStatus } from "@/lib/weekly/editor-data";

export interface AdsResult {
  ok: boolean;
  message?: string;
  synced?: number;
  window?: { from: string | null; to: string | null };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(x) ? x : null;
};
const int = (v: unknown): number | null => {
  const x = num(v);
  return x === null ? null : Math.round(x);
};

async function findReport(propertyCode: string, week: string) {
  return prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    select: { id: true, status: true },
  });
}

/** "Sync now" — pull this week's ads from the dashboard API. (EDITOR/ADMIN + lock.) */
export async function syncWeeklyAds(property: string, week: string): Promise<AdsResult> {
  const code = property.toUpperCase();
  const user = await getCurrentUser();
  if (!canEditProperty(user, code)) {
    return { ok: false, message: `You don't have edit access to ${code}.` };
  }
  if (!isAdsSyncConfigured()) {
    return { ok: false, message: "Ads sync isn't configured — set ADS_API_KEY on the server." };
  }
  const report = await findReport(code, week);
  if (!report) return { ok: false, message: "Report not found — create this week first." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to sync." };
  }

  let synced: number;
  let window: { from: string | null; to: string | null };
  try {
    const r = await syncAdsIntoReport(report.id, code);
    synced = r.rows;
    window = r.window;
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Ads sync failed." };
  }

  await logAudit("weekly_ads_sync", `${code} ${week}`, { rows: synced, window });
  revalidatePath(`/weekly/${code}/${week}/editor`);
  revalidatePath(`/weekly/${code}/${week}/dashboard`);
  return { ok: true, synced, window };
}

export interface AdsManualRow {
  platform: string;
  spend?: string | number | null;
  revenue?: string | number | null;
  conversions?: string | number | null;
  impressions?: string | number | null;
  clicks?: string | number | null;
}

/** Manual entry — upsert the blended/google/meta rows; clear a row left empty. */
export async function saveWeeklyAds(input: {
  property: string;
  week: string;
  rows: AdsManualRow[];
}): Promise<AdsResult> {
  const code = input.property.toUpperCase();
  const user = await getCurrentUser();
  if (!canEditProperty(user, code)) {
    return { ok: false, message: `You don't have edit access to ${code}.` };
  }
  const report = await findReport(code, input.week);
  if (!report) return { ok: false, message: "Report not found." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to edit." };
  }

  const valid = new Set<string>(AD_PLATFORMS.map((p) => p.id));
  const ops = input.rows
    .filter((r) => valid.has(r.platform))
    .map((r, i) => {
      const spend = num(r.spend);
      const revInput = num(r.revenue);
      const conversions = num(r.conversions);
      const impressions = int(r.impressions);
      const clicks = int(r.clicks);
      const empty = [spend, revInput, conversions, impressions, clicks].every((v) => v === null);
      if (empty) {
        return prisma.weeklyAdsRoas.deleteMany({ where: { reportWeekId: report.id, platform: r.platform } });
      }
      const revField = adsRevenueField(r.platform);
      const data = {
        spend,
        revenue: revField === "revenue" ? revInput : null,
        conversionValue: revField === "conversionValue" ? revInput : null,
        conversions, impressions, clicks,
        source: "manual", windowFrom: null, windowTo: null, sortOrder: i,
      };
      return prisma.weeklyAdsRoas.upsert({
        where: { reportWeekId_platform: { reportWeekId: report.id, platform: r.platform } },
        update: data,
        create: { reportWeekId: report.id, platform: r.platform, ...data },
      });
    });

  await prisma.$transaction(ops);
  await logAudit("weekly_ads_save", `${code} ${input.week}`, {});
  revalidatePath(`/weekly/${code}/${input.week}/editor`);
  revalidatePath(`/weekly/${code}/${input.week}/dashboard`);
  return { ok: true };
}
