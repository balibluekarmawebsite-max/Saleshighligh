"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { extractMarketSegments } from "@/lib/sales/market-segment-ai";
import { saveMarketSegments } from "@/lib/sales/market-segment-import";
import type { ExtractedSegment } from "@/lib/sales/market-segment-logic";

export interface ExtractResult {
  ok: boolean;
  error?: string;
  segments?: ExtractedSegment[];
}

/** Editor/admin: AI-extract market segment rows from pasted text or a screenshot (preview only). */
export async function extractMarketSegmentAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<ExtractResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractMarketSegments({ text: input.text, image });
  return r.ok ? { ok: true, segments: r.segments } : { ok: false, error: r.error };
}

export interface SaveResult {
  ok: boolean;
  message: string;
}

/** Editor/admin: save compiled market segment rows into segment_production. */
export async function saveMarketSegmentAction(input: {
  property: string;
  period: string;
  scope: "MTD" | "YTD";
  segments: ExtractedSegment[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveMarketSegments({
    property: input.property,
    period: input.period,
    scope: input.scope,
    segments: input.segments,
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) {
    revalidatePath(`/dashboard/${input.property}/${input.period}/rooms/segments`);
  }
  return { ok: r.ok, message: r.message };
}
