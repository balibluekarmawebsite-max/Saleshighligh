"use server";

import { revalidatePath } from "next/cache";

import { logAudit } from "@/lib/audit";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { periodToDate } from "@/lib/dashboard-data";
import { prisma } from "@/lib/prisma";
import { extractOverview, generateOverviewSection } from "@/lib/sales/restaurant-overview-ai";
import { serializeOverview, type OverviewData, type OverviewSection } from "@/lib/sales/restaurant-overview";
import { extractMealSales } from "@/lib/sales/restaurant-sales-ai";
import { saveMealSales } from "@/lib/sales/restaurant-sales-import";
import type { NormalMealRow, RawMealRow } from "@/lib/sales/restaurant-sales-logic";
import { extractSources } from "@/lib/sales/restaurant-sources-ai";
import { saveSources } from "@/lib/sales/restaurant-sources-import";
import type { NormalSourceRow, RawSourceRow } from "@/lib/sales/restaurant-sources-logic";
import { extractAcquisition } from "@/lib/sales/restaurant-acquisition-ai";
import { saveAcquisition } from "@/lib/sales/restaurant-acquisition-import";
import type {
  NormalChannelRow,
  NormalDailyRow,
  RawChannelRow,
  RawDailyRow,
} from "@/lib/sales/restaurant-acquisition-logic";

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

export interface OverviewExtractResult {
  ok: boolean;
  error?: string;
  data?: OverviewData;
}

/** Editor/admin: AI-sort a pasted/screenshotted overview into the four
 * sections (preview only — nothing is written). */
export async function extractRestaurantOverviewAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<OverviewExtractResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractOverview({ text: input.text, image });
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
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

export interface SourcesExtractResult {
  ok: boolean;
  error?: string;
  sources?: NormalSourceRow[];
}

/** Editor/admin: AI-extract Source-of-Booking rows from text/screenshot (preview only). */
export async function extractRestaurantSourcesAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<SourcesExtractResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractSources({ text: input.text, image });
  return r.ok ? { ok: true, sources: r.sources } : { ok: false, error: r.error };
}

/** Editor/admin: save Source-of-Booking rows (persons + revenue per source). */
export async function saveRestaurantSourcesAction(input: {
  property: string;
  period: string;
  sources: RawSourceRow[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveSources({
    property: input.property,
    period: input.period,
    sources: input.sources,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/restaurant`);
  return { ok: r.ok, message: r.message };
}

export interface AcquisitionExtractResult {
  ok: boolean;
  error?: string;
  channels?: NormalChannelRow[];
  daily?: NormalDailyRow[];
}

/** Editor/admin: AI-extract acquisition channels + daily rows from text/screenshot (preview only). */
export async function extractRestaurantAcquisitionAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<AcquisitionExtractResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractAcquisition({ text: input.text, image });
  return r.ok ? { ok: true, channels: r.channels, daily: r.daily } : { ok: false, error: r.error };
}

/** Editor/admin: save acquisition channels and/or daily cover-vs-booking rows. */
export async function saveRestaurantAcquisitionAction(input: {
  property: string;
  period: string;
  channels?: RawChannelRow[];
  daily?: RawDailyRow[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveAcquisition({
    property: input.property,
    period: input.period,
    channels: input.channels,
    daily: input.daily,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/restaurant`);
  return { ok: r.ok, message: r.message };
}
