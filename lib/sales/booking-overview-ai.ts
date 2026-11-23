/**
 * AI extraction for the Booking.com "Overview" (Search Performance). From the
 * "How your searches turned into bookings" funnel + "Availability for search"
 * screenshots or pasted text it returns the funnel counts, conversion rates,
 * availability, their "vs market" %, the report metadata and a monthly
 * availability trend. Nothing is written here; the values seed the editor.
 */

import {
  coerceBookingOverviewCore,
  normalizeAvailRows,
  type BookingOverviewCore,
  type NormalAvailRow,
  type RawAvailRow,
} from "@/lib/sales/booking-overview-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You read a Booking.com "Overview" / Search Performance report (the "How your searches turned into bookings" funnel and the "Availability for search" chart) from a screenshot or pasted text and return STRICT JSON. The report benchmarks MY PROPERTY against the overall MARKET; each metric shows a value and a "vs market" percentage (green/up = above market = positive; red/down = below market = negative).

Return ONLY this JSON (no prose, no code fences); use null for anything not shown and never invent numbers:
{
  "window": "<e.g. Last 90 days>",
  "dataAsOf": "<YYYY-MM-DD or human date>",
  "searchResultsViews": <int>, "searchResultsViewsVsMkt": <number|null>,
  "propertyPageVisits": <int>, "propertyPageVisitsVsMkt": <number|null>,
  "bookingsMade": <int>, "bookingsMadeVsMkt": <number|null>,
  "searchToPagePct": <number>, "searchToPageMarketPct": <number|null>, "searchToPageVsMkt": <number|null>,
  "pageToBookingPct": <number>, "pageToBookingMarketPct": <number|null>, "pageToBookingVsMkt": <number|null>,
  "availabilityPct": <number>, "availabilityVsMkt": <number|null>,
  "avail": [{"month":"YYYY-MM","yourPct":<number>,"marketPct":<number>}, ...]
}

Rules:
- Funnel counts (searchResultsViews, propertyPageVisits, bookingsMade) are whole numbers ("745,335" -> 745335).
- searchToPagePct = the "% clicked into your property page" (e.g. 2.56); searchToPageMarketPct = the market value shown in brackets (e.g. 3.32). pageToBookingPct = the "% booked your property" (e.g. 1.71); its market value (e.g. 1.52). availabilityPct = "Availability for search" (e.g. 68.64). These are PERCENT NUMBERS as shown.
- Every "...VsMkt" is the "vs market" percentage for that metric, SIGNED: a green/up arrow is positive ("+1,140.86%" -> 1140.86), a red/down arrow is negative ("-22.84%" -> -22.84). Keep the exact magnitude even when large.
- "avail" is the monthly availability trend line: one point per month shown, with YOUR availability % and the MARKET availability %. Omit it if no trend chart is shown.
- Return ONLY the JSON.`;

export interface BookingOverviewExtractResult {
  ok: boolean;
  error?: string;
  core?: BookingOverviewCore;
  avail?: NormalAvailRow[];
}

export async function extractBookingOverview(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<BookingOverviewExtractResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the Booking.com search-performance data or attach a screenshot first." };
  }
  const user = text
    ? `Extract the Booking.com search-performance funnel and availability from this data:\n\n${text}`
    : "Extract the Booking.com search-performance funnel and availability from the attached screenshot.";

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
    const core = coerceBookingOverviewCore(parsed);
    const availRaw = Array.isArray(parsed.avail)
      ? (parsed.avail as unknown[]).filter((r): r is RawAvailRow => typeof r === "object" && r !== null)
      : [];
    const avail = normalizeAvailRows(availRaw);
    return { ok: true, core, avail };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
