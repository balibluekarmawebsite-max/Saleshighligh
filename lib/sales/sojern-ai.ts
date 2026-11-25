/**
 * AI extraction for the Sojern "Market Overview". Reads ONE chart at a time (the
 * Flight Volume Index or the Hotel Volume Index) — splitting the two charts into
 * separate calls keeps each response small and reliably parseable. From a
 * screenshot or pasted text it returns the filter context and one point per
 * (year, month) for that metric. Nothing is written here.
 */

import {
  normalizeSojernMeta,
  normalizeSojernPoints,
  type NormalSojernMeta,
  type NormalSojernPoint,
  type RawSojernPoint,
  type SojernMetric,
} from "@/lib/sales/sojern-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

function buildSystem(metric: SojernMetric | null): string {
  const chart =
    metric === "FLIGHT"
      ? 'the "Flight Volume Index" chart'
      : metric === "HOTEL"
        ? 'the "Hotel Volume Index" chart'
        : 'the "Flight Volume Index" and "Hotel Volume Index" charts';
  const metricRule = metric
    ? `Every point's "metric" is "${metric}". If the other chart is also visible, IGNORE it — return ONLY "${metric}" points.`
    : `"metric" is "FLIGHT" (from the Flight Volume Index chart) or "HOTEL" (from the Hotel Volume Index chart).`;
  return `You read a Sojern "Market Overview" report — ${chart}, showing the % difference vs a baseline month (e.g. "vs Jan 2023 Baseline") for several years (one coloured line per year, e.g. 2023, 2024, 2025, 2026) across the 12 months Jan–Dec. Above the chart is a filter bar: Destination, Origin Country, Event Type, Time Period.

Return ONLY this JSON (no prose, no reasoning, no code fences); use the exact labels shown and never invent numbers:
{"destination":"<e.g. Indonesia, Bali>","originCountry":"<e.g. (All)>","eventType":"<e.g. Booking>","timePeriod":"<e.g. Monthly>","baselineLabel":"<the baseline month, e.g. Jan 2023>","points":[{"metric":"${metric ?? "FLIGHT"}","year":2026,"month":1,"value":32}]}

Rules:
- ${metricRule}
- "year" is the 4-digit year of the line (read from the legend colour). "month" is 1–12 (Jan=1 … Dec=12).
- "value" is the % difference vs the baseline read off the y-axis for that line at that month: a SIGNED number ("+40%" -> 40, "-20%" -> -20, baseline/0 -> 0). Approximate values read from the lines are expected.
- Include a point for every month that each year's line covers. Omit a year/month a line does not reach.
- If a filter value is not visible, use "". Return ONLY the JSON object.`;
}

export interface SojernExtractResult {
  ok: boolean;
  error?: string;
  meta?: NormalSojernMeta;
  points?: NormalSojernPoint[];
}

export async function extractSojern(
  input: { text?: string | null; image?: GroqImage | null; metric?: SojernMetric | null },
): Promise<SojernExtractResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the Sojern chart data or attach a screenshot first." };
  }
  const metric = input.metric ?? null;
  const which = metric === "FLIGHT" ? "flight" : metric === "HOTEL" ? "hotel" : "flight & hotel";
  const user = text
    ? `Extract the Sojern ${which} volume index from this data:\n\n${text}`
    : `Extract the Sojern ${which} volume index from the attached chart screenshot.`;

  try {
    const raw = await groqChat({
      system: buildSystem(metric),
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 2200,
    });
    const parsed = parseJsonLoose(raw) as Record<string, unknown>;
    const rawPoints = Array.isArray(parsed.points)
      ? (parsed.points as unknown[]).filter((r): r is RawSojernPoint => typeof r === "object" && r !== null)
      : [];
    // When a metric was requested, force it so a mislabelled row still lands in
    // the right chart, and drop any stray points from the other chart.
    const forced = metric ? rawPoints.map((r) => ({ ...r, metric })) : rawPoints;
    const points = normalizeSojernPoints(forced).filter((p) => !metric || p.metric === metric);
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
