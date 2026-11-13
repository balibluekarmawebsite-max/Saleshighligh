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

const SYSTEM = `You read a RESTAURANT "ACQUISITION SPLIT" (booking source) report and return STRICT JSON. The input can be EITHER of two kinds — detect which one it is and fill the matching array, leaving the other as []:
  (A) a CHANNEL split — a small table or pie-chart legend giving each channel's Booking % and Cover %, OR
  (B) a DAILY table — a day-by-day list of bookings and covers for the month.
It may occasionally contain both; then fill both. Always include BOTH keys.

Return ONLY this JSON (no prose, no code fences), using EXACTLY these key names:
{"channels":[{"channel":"Walk-in","bookingsPct":<number>,"coversPct":<number>}],"daily":[{"day":<int 1-31>,"bookings":<int>,"covers":<int>}]}

CHANNELS (the Booking vs Cover distribution / the two pie charts):
- One object per channel row. Keep the channel name EXACTLY as written: e.g. "Walk-in", "Repeater", "Chope", "Phone/WA", "Catering". The channel set can be anything — do NOT invent or drop channels.
- bookingsPct = that channel's share of BOOKINGS; coversPct = its share of COVERS. Output PERCENT NUMBERS, not ratios: "64.6%" -> 64.6; "31.4%" -> 31.4; "4.0%" -> 4.0. If a channel shows only one percentage, use it for both.
- Ignore any TOTAL / 100% row.

DAILY (the "Cover vs Booking" numbers / a day-by-day table):
- One object PER DAY, day = 1..31. bookings = that day's booking count, covers = that day's cover count. Plain integers.
- Read EVERY day row you can see, even if the table is long. Do NOT read values off a line/area chart image — only off actual numbers.
- If there is no daily table, return "daily":[].

Rules:
- Never invent numbers; read only what is shown, and read as much of it as you can.
- Whichever kind is present, do your best to extract it rather than returning everything empty.`;

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
      return {
        ok: false,
        error:
          "Couldn't read a channel split or a daily table from that. Upload the NUMBERS — a channel list with Booking %/Cover %, or a day-by-day Bookings/Covers table (not a chart image) — or paste the figures as text.",
      };
    }
    return { ok: true, channels, daily };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
