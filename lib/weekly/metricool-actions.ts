"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isLockedStatus } from "@/lib/weekly/editor-data";
import { isMetricoolConfigured, listMetricoolBrands, type MetricoolBrand } from "@/lib/weekly/metricool";
import { syncMetricoolIntoReport, type MetricoolSyncResult } from "@/lib/weekly/metricool-sync";

export interface MetricoolActionResult {
  ok: boolean;
  message?: string;
}

export interface MetricoolBrandsResult {
  ok: boolean;
  brands?: MetricoolBrand[];
  message?: string;
}

export interface MetricoolSyncActionResult {
  ok: boolean;
  message?: string;
  result?: MetricoolSyncResult;
}

/** Assign (or clear) the Metricool brand/blogId for a property. Admin only. */
export async function saveMetricoolBlogId(formData: FormData): Promise<MetricoolActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const blogId = String(formData.get("blogId") ?? "").trim();

  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only an administrator can change this." };

  const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
  if (!prop) return { ok: false, message: "Unknown property." };

  const existing = await prisma.weeklySetting.findFirst({
    where: { propertyId: prop.id, group: "metricool", key: "blogId" },
    select: { id: true },
  });
  if (existing) {
    await prisma.weeklySetting.update({ where: { id: existing.id }, data: { value: blogId || undefined } });
  } else if (blogId) {
    await prisma.weeklySetting.create({
      data: { propertyId: prop.id, group: "metricool", key: "blogId", value: blogId },
    });
  }

  await logAudit("weekly_metricool_assign", property, { blogId: blogId || null });
  revalidatePath(`/weekly/${property}`, "layout");
  return { ok: true, message: blogId ? "Brand assigned." : "Brand cleared." };
}

/** List the Metricool brands for the connected account. Admin only. */
export async function testMetricoolConnection(): Promise<MetricoolBrandsResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only an administrator can test this." };
  try {
    const brands = await listMetricoolBrands();
    return { ok: true, brands };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed." };
  }
}

async function findReport(propertyCode: string, week: string) {
  return prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    select: { id: true, status: true, propertyId: true },
  });
}

/** Persist the last sync's diagnostic so the preview + Excel note can show it. */
async function storeSyncMeta(propertyId: string, week: string, result: MetricoolSyncResult) {
  const existing = await prisma.weeklySetting.findFirst({
    where: { propertyId, group: "metricool", key: `sync_${week}` },
    select: { id: true },
  });
  const value = result as unknown as object;
  if (existing) {
    await prisma.weeklySetting.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.weeklySetting.create({
      data: { propertyId, group: "metricool", key: `sync_${week}`, value },
    });
  }
}

/** The last Metricool sync diagnostic for a property + week, or null. */
export async function getMetricoolSyncMeta(
  propertyCode: string,
  week: string,
): Promise<MetricoolSyncResult | null> {
  const prop = await prisma.property.findUnique({ where: { code: propertyCode.toUpperCase() }, select: { id: true } });
  if (!prop) return null;
  const row = await prisma.weeklySetting.findFirst({
    where: { propertyId: prop.id, group: "metricool", key: `sync_${week}` },
    select: { value: true },
  });
  if (!row || row.value == null || typeof row.value !== "object") return null;
  return row.value as unknown as MetricoolSyncResult;
}

/** "Sync now" — pull this week + last week's IG/FB metrics from Metricool. (EDITOR/ADMIN + lock.) */
export async function syncMetricoolNow(property: string, week: string): Promise<MetricoolSyncActionResult> {
  const code = property.toUpperCase();
  const user = await getCurrentUser();
  if (!canEditProperty(user, code)) {
    return { ok: false, message: `You don't have edit access to ${code}.` };
  }
  if (!isMetricoolConfigured()) {
    return { ok: false, message: "Metricool isn't configured — set METRICOOL_USER_TOKEN / METRICOOL_USER_ID on the server." };
  }
  const report = await findReport(code, week);
  if (!report) return { ok: false, message: "Report not found — create this week first." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to sync." };
  }

  let result: MetricoolSyncResult;
  try {
    result = await syncMetricoolIntoReport(report.id, code);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Metricool sync failed." };
  }

  await storeSyncMeta(report.propertyId, week, result);
  await logAudit("weekly_metricool_sync", `${code} ${week}`, { rows: result.rows, window: result.window });
  revalidatePath(`/weekly/${code}/${week}/editor`);
  revalidatePath(`/weekly/${code}/${week}/dashboard`);

  const filled = result.networks.filter((n) => n.wrote).map((n) => n.platform);
  const message = filled.length
    ? `Synced ${result.rows} metric${result.rows === 1 ? "" : "s"} (${filled.join(", ")}).`
    : "Connected, but no metrics resolved — check the brand assignment and metric names below.";
  return { ok: true, message, result };
}
