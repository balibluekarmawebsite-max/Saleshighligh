/**
 * AI extraction for the Restaurant "Acquisition Split" upload. From a pasted
 * block or a screenshot/file it returns two things for preview (nothing is
 * written here):
 *   - channels: [{ channel, bookingsPct, coversPct }] — Booking % and Cover %
 *     per channel (any channel set; percentages as plain numbers 0–100).
 *   - daily:    [{ day, bookings, covers }] — the daily Cover-vs-Booking series.
 * Whichever the source contains is returned; the other comes back empty.
 */

import {
  normalizeChannelRows,
  normalizeDailyRows,
  type NormalChannelRow,
  type NormalDailyRow,
} from "@/lib/sales/restaurant-acquisition-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You extract a RESTAURANT "ACQUISITION SPLIT" (booking source) report into STRICT JSON. There are two possible parts; include whichever the input actually contains, and use an empty array for the other.

Return ONLY this JSON (no prose, no code fences):
{"channels":[{"channel":"Walk-in","bookingsPct":<number>,"coversPct":<number>}],"daily":[{"day":<int 1-31>,"bookings":<int>,"covers":<int>}]}

CHANNELS (the Booking vs Cover distribution / the two pie charts):
- One object per channel. Keep the channel name EXACTLY as written: e.g. "Walk-in", "Repeater", "Chope", "Phone/WA", "Catering". The channel set can be anything — do NOT invent or drop channels.
- bookingsPct = that channel's share of BOOKINGS; coversPct = its share of COVERS. Output them as PERCENT NUMBERS, not ratios: "64.6%" -> 64.6; "31.4%" -> 31.4; "4.0%" -> 4.0.
- Ignore any TOTAL row.

DAILY (the "Cover vs Booking" chart / a day-by-day table):
- One object per day of the month, day = 1..31. bookings = that day's booking count, covers = that day's cover count. Plain integers.
- Only include days that have real numbers. If there is no daily table, return "daily":[].

Rules:
- Never invent numbers; read only what is shown.
- If a part is absent, return it as an empty array — do not fabricate it.`;

export async function extractAcquisition(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<
  | { ok: true; channels: NormalChannelRow[]; daily: NormalDailyRow[] }
  | { ok: false; error: string }
> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the acquisition data or attach a screenshot/file first." };
  }

  const user = text
    ? `Extract the acquisition channels (name, booking %, cover %) and any daily cover-vs-booking rows from this data:\n\n${text}`
    : "Extract the acquisition channels (name, booking %, cover %) and any daily cover-vs-booking rows from the attached image.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 3000,
    });
    const parsed = parseJsonLoose(raw) as { channels?: unknown; daily?: unknown };
    const channelRows = Array.isArray(parsed?.channels) ? (parsed.channels as never[]) : [];
    const dailyRows = Array.isArray(parsed?.daily) ? (parsed.daily as never[]) : [];
    const { rows: channels } = normalizeChannelRows(channelRows);
    const { rows: daily } = normalizeDailyRows(dailyRows);
    if (channels.length === 0 && daily.length === 0) {
      return { ok: false, error: "No acquisition data could be read — check the format and try again." };
    }
    return { ok: true, channels, daily };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
