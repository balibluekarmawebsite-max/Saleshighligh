"use server";

import { revalidatePath } from "next/cache";

import { logAudit } from "@/lib/audit";
import { canEditProperty, getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { runMonthlySocialSync, type SocialUnit } from "@/lib/sales/social-monthly-sync";
import { isMetricoolConfigured, listMetricoolBrands, unitBlogIdKey, type MetricoolBrand } from "@/lib/weekly/metricool";

export interface SocialSyncActionResult {
  ok: boolean;
  message: string;
}

export interface SocialBrandsResult {
  ok: boolean;
  brands?: MetricoolBrand[];
  message?: string;
}

const UNITS: SocialUnit[] = ["HOTEL", "RESTAURANT", "SPA"];
const normUnit = (u: unknown): SocialUnit => {
  const v = String(u ?? "").toUpperCase();
  return (UNITS as string[]).includes(v) ? (v as SocialUnit) : "HOTEL";
};

/** Editor/admin: pull one business unit's monthly social metrics from Metricool. */
export async function syncMonthlySocialAction(input: {
  property: string;
  period: string;
  unit?: SocialUnit;
}): Promise<SocialSyncActionResult> {
  const code = String(input.property ?? "").toUpperCase();
  const user = await getCurrentUser();
  if (!canEditProperty(user, code)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await runMonthlySocialSync({
    property: code,
    period: input.period,
    unit: normUnit(input.unit),
    uploadedBy: user?.email ?? null,
  });
  if (r.body.ok) revalidatePath(`/dashboard/${code}/${input.period}/social`);
  return r.body.ok ? { ok: true, message: r.body.message } : { ok: false, message: r.body.error };
}

/** Admin: list the Metricool brands for the connected account (for the brand picker). */
export async function listSocialBrandsAction(): Promise<SocialBrandsResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only an administrator can list brands." };
  if (!isMetricoolConfigured()) {
    return { ok: false, message: "Metricool isn't configured — set METRICOOL_USER_TOKEN / METRICOOL_USER_ID." };
  }
  try {
    return { ok: true, brands: await listMetricoolBrands() };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Connection failed." };
  }
}

/** Admin: assign (or clear) a business unit's Metricool brand (blogId). HOTEL
 *  writes the shared `blogId` (same brand the weekly report uses); RESTAURANT/SPA
 *  write their own `blogId:UNIT` key. */
export async function saveSocialUnitBrandAction(input: {
  property: string;
  period: string;
  unit: SocialUnit;
  blogId: string;
}): Promise<SocialSyncActionResult> {
  const code = String(input.property ?? "").toUpperCase();
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only an administrator can change the brand." };

  const prop = await prisma.property.findUnique({ where: { code }, select: { id: true } });
  if (!prop) return { ok: false, message: "Unknown property." };

  const unit = normUnit(input.unit);
  const key = unitBlogIdKey(unit);
  const blogId = String(input.blogId ?? "").trim();

  await prisma.weeklySetting.upsert({
    where: { propertyId_group_key: { propertyId: prop.id, group: "metricool", key } },
    create: { propertyId: prop.id, group: "metricool", key, value: blogId || "" },
    update: { value: blogId || "" },
  });

  await logAudit("sales_social_brand_assign", `${code} ${unit}`, { blogId: blogId || null });
  revalidatePath(`/dashboard/${code}/${input.period}/social`);
  return { ok: true, message: blogId ? `${unit} brand assigned.` : `${unit} brand cleared.` };
}
