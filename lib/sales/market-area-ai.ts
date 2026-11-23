/**
 * AI extraction for the Booking.com "Market Area Update". From the Sales-
 * statistics "Room nights and average daily rate" chart (a screenshot) or
 * pasted text it returns one row per month — the PROPERTY and the MARKET values
 * for room nights and average daily rate (IDR). Nothing is written here; the
 * values seed the editable grid for review.
 */

import { normalizeMarketAreaRows, type RawMarketAreaRow } from "@/lib/sales/market-area-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You read a Booking.com "Sales statistics" chart titled "Room nights and average daily rate" (Monthly view) and return STRICT JSON. The chart shows, per month on the x-axis:
- a DARK BLUE bar = the PROPERTY's room nights (left axis),
- a LIGHT BLUE bar = the MARKET's room nights (left axis),
- an ORANGE line = the PROPERTY's average daily rate in IDR (right axis),
- a YELLOW line = the MARKET's average daily rate in IDR (right axis).

Return ONLY this JSON (no prose, no code fences):
{"rows":[{"month":"YYYY-MM","propertyRoomNights":<int>,"marketRoomNights":<int>,"propertyAdr":<int>,"marketAdr":<int>}, ...]}

Rules:
- One object per month shown, in chart order. "month" is "YYYY-MM" (e.g. "Apr 2026" -> "2026-04").
- Room nights are whole numbers read off the left axis. ADR values are whole IDR amounts read off the right axis — expand millions: "IDR 3.7M" -> 3700000, "2,300,000" -> 2300000.
- Read each series by its colour. If a month's bar/point is not visible or is zero, use 0.
- Approximate values read from the chart are expected; do not invent months that are not shown. Return ONLY the JSON.`;

export interface MarketAreaExtractResult {
  ok: boolean;
  error?: string;
  rows?: RawMarketAreaRow[];
}

export async function extractMarketArea(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<MarketAreaExtractResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the Booking.com sales statistics or attach a screenshot first." };
  }
  const user = text
    ? `Extract the monthly property-vs-market room nights and ADR from this data:\n\n${text}`
    : "Extract the monthly property-vs-market room nights and ADR from the attached chart screenshot.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 1500,
    });
    const parsed = parseJsonLoose(raw) as { rows?: unknown } | unknown[];
    const arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { rows?: unknown }).rows) ? (parsed as { rows: unknown[] }).rows : [];
    const rawRows = (arr as unknown[]).filter((r): r is RawMarketAreaRow => typeof r === "object" && r !== null);
    // Validate/clean through the shared normaliser, then hand back clean rows.
    const rows = normalizeMarketAreaRows(rawRows);
    if (rows.length === 0) {
      return { ok: false, error: "No monthly figures could be read — check the chart screenshot and try again." };
    }
    return { ok: true, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
