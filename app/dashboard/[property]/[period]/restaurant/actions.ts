"use server";

import { revalidatePath } from "next/cache";

import { logAudit } from "@/lib/audit";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { periodToDate } from "@/lib/dashboard-data";
import { prisma } from "@/lib/prisma";
import { generateOverviewSection } from "@/lib/sales/restaurant-overview-ai";
import { serializeOverview, type OverviewData, type OverviewSection } from "@/lib/sales/restaurant-overview";
import { extractMealSales } from "@/lib/sales/restaurant-sales-ai";
import { saveMealSales } from "@/lib/sales/restaurant-sales-import";
import type { NormalMealRow, RawMealRow } from "@/lib/sales/restaurant-sales-logic";

export interface GenerateResult {
  ok: boolean;
  text?: string;
  error?: string;
}

/** Editor/admin: AI-generate one Restaurant Overview section (preview only). */
export async function generateRestaurantOverviewAction(input: {
  property: string;
  period: string;
  section: OverviewSection;
}): Promise<GenerateResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const r = await generateOverviewSection({ property: input.property, period: input.period, section: input.section });
  return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error };
}

export interface SaveResult {
  ok: boolean;
  message: string;
}

/** Editor/admin: save the structured Restaurant Overview (JSON into the
 * RESTAURANT_OVERVIEW narrative row + a version history row). FINAL locked. */
export async function saveRestaurantOverviewAction(input: {
  property: string;
  period: string;
  data: OverviewData;
  aiGenerated?: boolean;
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }

  const reportPeriod = await prisma.reportPeriod.findFirst({
    where: { property: { code: input.property }, period: periodToDate(input.period) },
    select: { id: true, status: true },
  });
  if (!reportPeriod) return { ok: false, message: "No report period found for this property/period." };
  if (reportPeriod.status === "FINAL") return { ok: false, message: "This period is FINAL and locked for edits." };

  const content = serializeOverview(input.data);
  const aiGenerated = Boolean(input.aiGenerated);

  try {
    await prisma.$transaction([
      prisma.narrativeContent.upsert({
        where: { periodId_section: { periodId: reportPeriod.id, section: "RESTAURANT_OVERVIEW" } },
        create: { periodId: reportPeriod.id, section: "RESTAURANT_OVERVIEW", content, aiGenerated },
        update: { content, aiGenerated },
      }),
      prisma.narrativeVersion.create({
        data: {
          periodId: reportPeriod.id,
          section: "RESTAURANT_OVERVIEW",
          content,
          aiGenerated,
          source: aiGenerated ? "ai" : "human",
        },
      }),
    ]);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save the overview." };
  }

  await logAudit("narrative.save", `${input.property} ${input.period} RESTAURANT_OVERVIEW`, {
    source: aiGenerated ? "ai" : "human",
  }).catch(() => {});
  revalidatePath(`/dashboard/${input.property}/${input.period}/restaurant`);
  return { ok: true, message: "Overview saved." };
}

export interface MealExtractResult {
  ok: boolean;
  error?: string;
  meals?: NormalMealRow[];
}

/** Editor/admin: AI-extract Restaurant Sales meal rows from text/screenshot (preview only). */
export async function extractMealSalesAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<MealExtractResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractMealSales({ text: input.text, image });
  return r.ok ? { ok: true, meals: r.meals } : { ok: false, error: r.error };
}

/** Editor/admin: save Restaurant Sales meal rows (covers + revenue per meal). */
export async function saveMealSalesAction(input: {
  property: string;
  period: string;
  meals: RawMealRow[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveMealSales({
    property: input.property,
    period: input.period,
    meals: input.meals,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/restaurant`);
  return { ok: r.ok, message: r.message };
}
