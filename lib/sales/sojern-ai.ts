/**
 * AI extraction for the Sojern "Market Overview". From the Flight Volume Index
 * and Hotel Volume Index line charts (screenshots) or pasted text it returns the
 * filter context and one point per (metric, year, month) — the % difference vs
 * the baseline. Nothing is written here; the values seed the editable grids.
 */

import {
  normalizeSojernMeta,
  normalizeSojernPoints,
  type NormalSojernMeta,
  type NormalSojernPoint,
  type RawSojernPoint,
} from "@/lib/sales/sojern-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You read a Sojern "Market Overview" report — two line charts, "Flight Volume Index" and "Hotel Volume Index", each showing the % difference vs a baseline month (e.g. "vs Jan 2023 Baseline") for several years (one coloured line per year, e.g. 2023, 2024, 2025, 2026) across the 12 months Jan–Dec. Above the charts is a filter bar: Destination, Origin Country, Event Type, Time Period.

Return ONLY this JSON (no prose, no code fences); use the exact labels shown and never invent numbers:
{
  "destination": "<e.g. Indonesia, Bali>",
  "originCountry": "<e.g. (All)>",
  "eventType": "<e.g. Booking>",
  "timePeriod": "<e.g. Monthly>",
  "baselineLabel": "<the baseline month, e.g. Jan 2023>",
  "points": [{"metric":"FLIGHT","year":2023,"month":1,"value":0}, {"metric":"HOTEL","year":2026,"month":12,"value":-57}, ...]
}

Rules:
- "metric" is "FLIGHT" (from the Flight Volume Index chart) or "HOTEL" (from the Hotel Volume Index chart).
- "year" is the 4-digit year of the line (read from the legend colour). "month" is 1–12 (Jan=1 … Dec=12).
- "value" is the % difference vs the baseline read off the y-axis for that line at that month: a SIGNED number ("+40%" -> 40, "-20%" -> -20, baseline/0 -> 0). Approximate values read from the lines are expected.
- Include a point for every month that each year's line covers, for BOTH charts. Omit a year/month a line does not reach.
- Return ONLY the JSON.`;

export interface SojernExtractResult {
  ok: boolean;
  error?: string;
  meta?: NormalSojernMeta;
  points?: NormalSojernPoint[];
}

export async function extractSojern(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<SojernExtractResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the Sojern market overview or attach a screenshot first." };
  }
  const user = text
    ? `Extract the Sojern flight & hotel volume indices from this data:\n\n${text}`
    : "Extract the Sojern flight & hotel volume indices from the attached chart screenshots.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 3000,
    });
    const parsed = parseJsonLoose(raw) as Record<string, unknown>;
    const rawPoints = Array.isArray(parsed.points)
      ? (parsed.points as unknown[]).filter((r): r is RawSojernPoint => typeof r === "object" && r !== null)
      : [];
    const points = normalizeSojernPoints(rawPoints);
    if (points.length === 0) {
      return { ok: false, error: "No Sojern index values could be read — check the chart screenshot and try again." };
    }
    const meta = normalizeSojernMeta({
      destination: parsed.destination,
      originCountry: parsed.originCountry,
      eventType: parsed.eventType,
      timePeriod: parsed.timePeriod,
      baselineLabel: parsed.baselineLabel,
    });
    return { ok: true, meta, points };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
