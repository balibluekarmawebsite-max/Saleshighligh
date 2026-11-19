/**
 * AI extraction for the Restaurant "Tripadvisor" listing report. Sends pasted
 * text or a screenshot (the Performance / Reviews / Listing-engagement tabs) to
 * Groq and returns the form values for preview — nothing is written here.
 * Reuses the weekly Groq client.
 */

import {
  coerceTripadvisorCore,
  TRIPADVISOR_METRICS,
  type TripadvisorCore,
} from "@/lib/sales/tripadvisor-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You read a Tripadvisor LISTING PERFORMANCE report (for a restaurant) from pasted text or a screenshot and return STRICT JSON. The report has three tabs: Performance, Reviews, and Listing engagement.

Return ONLY this JSON (no prose, no code fences). Use null for anything not shown; never invent numbers:
{
  "rating": <number|null>,        // review rating out of 5, e.g. 5.0
  "rank": <int|null>,             // listing position: "#1 of 483" -> 1
  "totalInMarket": <int|null>,    // the "of N" total: "#1 of 483" -> 483
  "impressions": <int|null>,      // Listing impressions
  "pageVisitors": <int|null>,     // Unique page visitors
  "newReviews": <int|null>,
  "qrReviews": <int|null>,        // QR Code Reviews
  "photoViews": <int|null>,
  "videoViews": <int|null>,
  "specialOfferClicks": <int|null>,
  "updateViews": <int|null>,
  "menuViews": <int|null>,
  "phoneCalls": <int|null>,
  "websiteClicks": <int|null>,
  "mapViews": <int|null>,
  "impressionsMom": <number|null>, "pageVisitorsMom": <number|null>,
  "photoViewsMom": <number|null>, "videoViewsMom": <number|null>,
  "specialOfferClicksMom": <number|null>, "updateViewsMom": <number|null>,
  "menuViewsMom": <number|null>, "phoneCallsMom": <number|null>,
  "websiteClicksMom": <number|null>, "mapViewsMom": <number|null>
}

Rules:
- Each "...Mom" is the metric's "vs previous period" percentage shown next to its value. A DOWN / red arrow (▼) means NEGATIVE ("▼ 9%" -> -9); an UP / green arrow (▲) means POSITIVE ("▲ 25%" -> 25). A dash "—" or no arrow means null.
- Strip "#", "of", "%", and thousands separators: "7,090" -> 7090, "#1 of 483" -> rank 1, total 483.
- Ignore asset-inventory counts such as "1805 photos" or "1 video" — those are NOT photoViews/videoViews, which are the VIEW numbers (e.g. 700, 0).
- All values are whole numbers except rating (one decimal) and the MoM percentages.`;

export interface TripadvisorExtractResult {
  ok: boolean;
  error?: string;
  values?: Record<string, number>;
}

/** Keys on TripadvisorCore that are plain counts (always a number, default 0). */
type CountKey = (typeof TRIPADVISOR_METRICS)[number]["valueField"];

export async function extractTripadvisor(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<TripadvisorExtractResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the Tripadvisor report text or attach a screenshot first." };
  }

  const user = text
    ? `Extract the Tripadvisor listing metrics from this data:\n\n${text}`
    : "Extract the Tripadvisor listing metrics from the attached screenshot.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 1500,
    });
    const parsed = parseJsonLoose(raw) as Record<string, unknown>;
    const core = coerceTripadvisorCore(parsed);

    // Flatten to the uploader's form fields. Counts always seed (the report shows
    // 0s explicitly); rating/rank/total/MoM seed only when actually read.
    const values: Record<string, number> = {};
    const put = (k: string, v: number | null) => {
      if (v != null) values[k] = v;
    };
    put("rating", core.avgRating > 0 ? core.avgRating : null);
    put("rank", core.rank);
    put("totalInMarket", core.totalInMarket);
    for (const m of TRIPADVISOR_METRICS) {
      values[m.valueField] = core[m.valueField as CountKey];
      if (m.momField) put(m.momField, core[m.momField as keyof TripadvisorCore] as number | null);
    }

    if (Object.keys(values).length === 0) {
      return { ok: false, error: "No Tripadvisor metrics could be read from that input — check the format and try again." };
    }
    return { ok: true, values };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
