"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { listMetricoolBrands, type MetricoolBrand } from "@/lib/weekly/metricool";

export interface MetricoolActionResult {
  ok: boolean;
  message?: string;
}

export interface MetricoolBrandsResult {
  ok: boolean;
  brands?: MetricoolBrand[];
  message?: string;
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
