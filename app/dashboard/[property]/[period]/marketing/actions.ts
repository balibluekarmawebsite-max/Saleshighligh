"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { runMonthlyAdsSync } from "@/lib/sales/ads-monthly-sync";
import { extractOtaRankings } from "@/lib/sales/ota-ranking-ai";
import { saveOtaRankings } from "@/lib/sales/ota-ranking-import";
import type { NormalRankingRow, RawRankingRow } from "@/lib/sales/ota-ranking-logic";

export interface MarketingActionResult {
  ok: boolean;
  message: string;
}

/** Editor/admin: pull this month's Digital Ads & ROAS from the ads dashboard API. */
export async function syncMonthlyAdsAction(input: {
  property: string;
  period: string;
}): Promise<MarketingActionResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await runMonthlyAdsSync({ property: input.property, period: input.period, uploadedBy: user?.email ?? null });
  if (r.body.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/marketing`);
  return r.body.ok ? { ok: true, message: r.body.message } : { ok: false, message: r.body.error };
}

export interface OtaExtractResult {
  ok: boolean;
  error?: string;
  rankings?: NormalRankingRow[];
}

/** Editor/admin: AI-extract OTA ranking rows from pasted text or a screenshot (preview only). */
export async function extractOtaRankingAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<OtaExtractResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractOtaRankings({ text: input.text, image });
  return r.ok ? { ok: true, rankings: r.rankings } : { ok: false, error: r.error };
}

/** Editor/admin: save OTA ranking rows for the period (one recorded month).
 * Rows arrive as raw strings and are parsed server-side (locale-aware). */
export async function saveOtaRankingAction(input: {
  property: string;
  period: string;
  rankings: RawRankingRow[];
}): Promise<MarketingActionResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveOtaRankings({
    property: input.property,
    period: input.period,
    rankings: input.rankings,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/marketing`);
  return { ok: r.ok, message: r.message };
}
