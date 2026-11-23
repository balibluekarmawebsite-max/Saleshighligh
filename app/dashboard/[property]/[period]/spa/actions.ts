"use server";

import { revalidatePath } from "next/cache";

import { logAudit } from "@/lib/audit";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { periodToDate } from "@/lib/dashboard-data";
import { prisma } from "@/lib/prisma";
import { extractOverview } from "@/lib/sales/restaurant-overview-ai";
import { generateSpaOverviewSection } from "@/lib/sales/spa-overview-ai";
import { serializeOverview, type OverviewData, type OverviewSection } from "@/lib/sales/restaurant-overview";
import { extractSpaPerformance } from "@/lib/sales/spa-performance-ai";
import { saveSpaPerformance } from "@/lib/sales/spa-performance-import";
import type { NormalSpaPerfRow, RawSpaPerfRow } from "@/lib/sales/spa-performance-logic";
import { extractSpaTreatments } from "@/lib/sales/spa-treatments-ai";
import { saveSpaTreatments } from "@/lib/sales/spa-treatments-import";
import type { NormalTreatmentRow, RawTreatmentRow } from "@/lib/sales/spa-treatments-logic";
import { runMonthlyAdsSync } from "@/lib/sales/ads-monthly-sync";
import { saveGokai } from "@/lib/sales/gokai-import";
import { saveTripadvisor } from "@/lib/sales/tripadvisor-import";

export interface GenerateResult {
  ok: boolean;
  text?: string;
  error?: string;
}

/** Editor/admin: AI-generate one Spa Overview section (preview only). */
export async function generateSpaOverviewAction(input: {
  property: string;
  period: string;
  section: OverviewSection;
}): Promise<GenerateResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const r = await generateSpaOverviewSection({ property: input.property, period: input.period, section: input.section });
  return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error };
}

export interface OverviewExtractResult {
  ok: boolean;
  error?: string;
  data?: OverviewData;
}

/** Editor/admin: AI-sort a pasted/screenshotted spa overview into the four
 * sections (preview only — nothing is written). */
export async function extractSpaOverviewAction(input: {
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
  const r = await extractOverview({ text: input.text, image, unit: "spa" });
  return r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error };
}

export interface SaveResult {
  ok: boolean;
  message: string;
}

/** Editor/admin: save the structured Spa Overview (JSON into the SPA_OVERVIEW
 * narrative row + a version history row). FINAL periods are locked. */
export async function saveSpaOverviewAction(input: {
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
        where: { periodId_section: { periodId: reportPeriod.id, section: "SPA_OVERVIEW" } },
        create: { periodId: reportPeriod.id, section: "SPA_OVERVIEW", content, aiGenerated },
        update: { content, aiGenerated },
      }),
      prisma.narrativeVersion.create({
        data: {
          periodId: reportPeriod.id,
          section: "SPA_OVERVIEW",
          content,
          aiGenerated,
          source: aiGenerated ? "ai" : "human",
        },
      }),
    ]);
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save the overview." };
  }

  await logAudit("narrative.save", `${input.property} ${input.period} SPA_OVERVIEW`, {
    source: aiGenerated ? "ai" : "human",
  }).catch(() => {});
  revalidatePath(`/dashboard/${input.property}/${input.period}/spa`);
  return { ok: true, message: "Overview saved." };
}

export interface SpaPerfExtractResult {
  ok: boolean;
  error?: string;
  segments?: NormalSpaPerfRow[];
}

/** Editor/admin: AI-extract the Spa guest-segment performance table from
 * text/screenshot (preview only — nothing is written). */
export async function extractSpaPerformanceAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<SpaPerfExtractResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractSpaPerformance({ text: input.text, image });
  return r.ok ? { ok: true, segments: r.segments } : { ok: false, error: r.error };
}

/** Editor/admin: save the Spa guest-segment performance (covers + revenue,
 * actual + budget) into SpaSales. */
export async function saveSpaPerformanceAction(input: {
  property: string;
  period: string;
  segments: RawSpaPerfRow[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveSpaPerformance({
    property: input.property,
    period: input.period,
    segments: input.segments,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/spa`);
  return { ok: r.ok, message: r.message };
}

export interface TreatmentsExtractResult {
  ok: boolean;
  error?: string;
  treatments?: NormalTreatmentRow[];
}

/** Editor/admin: AI-extract the Spa Top Treatments table from text/screenshot
 * (preview only — nothing is written). */
export async function extractSpaTreatmentsAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<TreatmentsExtractResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractSpaTreatments({ text: input.text, image });
  return r.ok ? { ok: true, treatments: r.treatments } : { ok: false, error: r.error };
}

/** Editor/admin: save the Spa Top Treatments (count + revenue per treatment). */
export async function saveSpaTreatmentsAction(input: {
  property: string;
  period: string;
  treatments: RawTreatmentRow[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveSpaTreatments({
    property: input.property,
    period: input.period,
    treatments: input.treatments,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/spa`);
  return { ok: r.ok, message: r.message };
}

/**
 * Editor/admin: pull this month's Spa ads (Spend / Impressions / Reach /
 * Clicks / ROAS, Google + Meta + OpenAI) from the ads dashboard — scoped to the
 * spa outlet (Mudara / Flying Bamboo / Heiwa, i.e. <code>-SPA) — and write them
 * as the SPA-unit `AdsPerformance` rows the Spa Ads block reads.
 */
export async function syncSpaAdsAction(input: {
  property: string;
  period: string;
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await runMonthlyAdsSync({
    property: input.property,
    period: input.period,
    unit: "SPA",
    uploadedBy: user?.email ?? null,
  });
  if (r.body.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/spa`);
  return r.body.ok ? { ok: true, message: r.body.message } : { ok: false, message: r.body.error };
}

/** Editor/admin: save the Gokai report (six metrics + reported MoM) for a unit,
 * from the Spa page (defaults the uploader to the SPA unit). */
export async function saveSpaGokaiAction(input: {
  property: string;
  period: string;
  unit?: string;
  core: Record<string, unknown>;
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveGokai({
    property: input.property,
    period: input.period,
    unit: input.unit,
    core: input.core,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/spa`);
  return { ok: r.ok, message: r.message };
}

/** Editor/admin: save the Spa Tripadvisor listing report (unit=SPA). */
export async function saveSpaTripadvisorAction(input: {
  property: string;
  period: string;
  core: Record<string, unknown>;
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveTripadvisor({
    property: input.property,
    period: input.period,
    unit: "SPA",
    core: input.core,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/spa`);
  return { ok: r.ok, message: r.message };
}
