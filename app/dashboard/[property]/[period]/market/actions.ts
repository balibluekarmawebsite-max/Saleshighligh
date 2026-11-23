"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { extractMarketArea } from "@/lib/sales/market-area-ai";
import { saveMarketArea } from "@/lib/sales/market-area-import";
import type { RawMarketAreaRow } from "@/lib/sales/market-area-logic";

export interface SaveResult {
  ok: boolean;
  message: string;
}

export interface MarketAreaExtractActionResult {
  ok: boolean;
  error?: string;
  rows?: RawMarketAreaRow[];
}

/** Editor/admin: AI-extract the Booking.com Market Area monthly series (preview only). */
export async function extractMarketAreaAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<MarketAreaExtractActionResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractMarketArea({ text: input.text, image });
  return r.ok ? { ok: true, rows: r.rows } : { ok: false, error: r.error };
}

/** Editor/admin: save the Booking.com Market Area monthly series. */
export async function saveMarketAreaAction(input: {
  property: string;
  period: string;
  rows: RawMarketAreaRow[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveMarketArea({
    property: input.property,
    period: input.period,
    rows: input.rows,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/market`);
  return { ok: r.ok, message: r.message };
}
