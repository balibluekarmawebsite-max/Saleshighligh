/**
 * AI extraction for the Booking.com "Booking Window" insight. From the
 * "Reservations per book window" chart (a screenshot) or pasted text it returns
 * the report metadata (window, data-as-of, total booked rooms) and one row per
 * lead-time bucket — the property's and the market's reservation share (%) and
 * ADR (IDR). Nothing is written here; the values seed the editable grid.
 */

import {
  normalizeBookingWindowMeta,
  normalizeBookingWindowRows,
  type NormalBookingWindowMeta,
  type NormalBookingWindowRow,
  type RawBookingWindowRow,
} from "@/lib/sales/booking-window-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You read a Booking.com "Reservations per book window" chart (how far ahead guests book) and return STRICT JSON. The chart groups reservations into lead-time buckets on the x-axis: "0-1 day", "2-3 days", "4-7 days", "8-14 days", "15-30 days", "31-60 days", "61-90 days", "91+ days", "Unspecified". For each bucket:
- a DARK BLUE bar = MY PROPERTY's reservation share (left axis, a PERCENT),
- a LIGHT BLUE bar = the MARKET's reservation share (left axis, a PERCENT),
- an ORANGE line point = MY PROPERTY's average daily rate in IDR (right axis),
- a YELLOW line point = the MARKET's average daily rate in IDR (right axis).
Above/around the chart it also shows the window (e.g. "Last 90 days"), a "Data as of" date, and a total booked rooms count.

Return ONLY this JSON (no prose, no code fences):
{"window":"<e.g. Last 90 days>","dataAsOf":"<YYYY-MM-DD or human date>","totalBookedRooms":<int>,"rows":[{"bucket":"0-1 day","propertyShare":<number>,"marketShare":<number>,"propertyAdr":<int>,"marketAdr":<int>}, ...]}

Rules:
- One object per bucket shown, in chart order. Use the exact bucket labels above.
- Shares are PERCENT numbers read off the left axis ("18%" -> 18). ADR values are whole IDR amounts read off the right axis — expand millions ("IDR 4.0M" -> 4000000).
- Read each series by its colour. A bucket with no visible bar/point is 0.
- Approximate values read from the chart are expected; do not invent buckets not shown. Return ONLY the JSON.`;

export interface BookingWindowExtractResult {
  ok: boolean;
  error?: string;
  meta?: NormalBookingWindowMeta;
  rows?: NormalBookingWindowRow[];
}

export async function extractBookingWindow(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<BookingWindowExtractResult> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the Booking.com book-window data or attach a screenshot first." };
  }
  const user = text
    ? `Extract the booking-window shares and ADR (property vs market) from this data:\n\n${text}`
    : "Extract the booking-window shares and ADR (property vs market) from the attached chart screenshot.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 1500,
    });
    const parsed = parseJsonLoose(raw) as { window?: unknown; dataAsOf?: unknown; totalBookedRooms?: unknown; rows?: unknown };
    const rawRows = Array.isArray(parsed.rows)
      ? (parsed.rows as unknown[]).filter((r): r is RawBookingWindowRow => typeof r === "object" && r !== null)
      : [];
    const rows = normalizeBookingWindowRows(rawRows);
    if (rows.length === 0) {
      return { ok: false, error: "No booking-window figures could be read — check the chart screenshot and try again." };
    }
    const meta = normalizeBookingWindowMeta({
      window: parsed.window,
      dataAsOf: parsed.dataAsOf,
      totalBookedRooms: parsed.totalBookedRooms,
    });
    return { ok: true, meta, rows };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
