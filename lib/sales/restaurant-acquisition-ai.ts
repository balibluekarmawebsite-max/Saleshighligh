/**
 * AI extraction for the Restaurant "Acquisition Split" upload. The upload is
 * SPLIT BY TYPE so each compile is scoped to exactly one kind of data (fewer
 * cross-type misreads):
 *   - mode "channels" → [{ channel, bookingsPct, coversPct }] (Booking %/Cover %)
 *   - mode "daily"    → [{ day, bookings, covers }] (the daily Cover-vs-Booking)
 *   - mode "both"     → both (kept for a combined paste)
 * Nothing is written here — the caller previews and the user can edit first.
 */

import {
  normalizeChannelRows,
  normalizeDailyRows,
  type NormalChannelRow,
  type NormalDailyRow,
} from "@/lib/sales/restaurant-acquisition-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

export type AcquisitionMode = "channels" | "daily" | "both";

const CHANNELS_SYSTEM = `You read a RESTAURANT ACQUISITION "channel split" and return STRICT JSON:
{"channels":[{"channel":"Walk-in","bookingsPct":<number>,"coversPct":<number>}]}

- The input is a small table or a pie-chart legend listing each booking channel with its share of BOOKINGS and its share of COVERS.
- One object per channel row. Keep the channel name EXACTLY as written: e.g. "Walk-in", "Repeater", "Chope", "Phone/WA", "Catering". The channel set can be anything — do NOT invent or drop channels.
- bookingsPct = share of BOOKINGS; coversPct = share of COVERS. Output PERCENT NUMBERS (not ratios): "64.6%" -> 64.6; "31.4%" -> 31.4; "4.0%" -> 4.0. If only one percentage is shown for a channel, use it for both.
- Ignore any TOTAL / 100% row. Never invent numbers; read only what is shown.
- Return ONLY the JSON (no prose, no code fences).`;

const DAILY_SYSTEM = `You read a restaurant's DAILY "Cover vs Booking" data for one month and return STRICT JSON:
{"daily":[{"day":<int 1-31>,"bookings":<int>,"covers":<int>}],"fromChart":<true|false>}

- One object PER DAY of the month (day = 1..31). bookings = that day's BOOKING count; covers = that day's COVER count. Plain integers.
- Usually the input is a day-by-day TABLE. Read EVERY day row in order. The table may be oriented with days down the side (one row per day) or across the top (one column per day) — handle either and still return one object per day. Set "fromChart": false.
- If the ONLY thing provided is a line/area chart titled "Cover vs Booking" (a Booking line and a Cover line/band over days 1..31), ESTIMATE each day's two values from the chart as closely as you can, calibrating against the Y-axis gridlines (e.g. 0, 20, 40, 60): Booking = the lower (blue) line's height that day; Cover = the upper (red) line/band TOP that day (Cover is always ≥ Booking). Return one object per visible day and set "fromChart": true. These are approximate.
- Never leave "daily" empty if any day values are visible. Never invent days that are not shown.
- Return ONLY the JSON (no prose, no code fences).`;

const BOTH_SYSTEM = `You read a RESTAURANT "ACQUISITION SPLIT" report and return STRICT JSON with BOTH keys (use [] for whichever is absent):
{"channels":[{"channel":"Walk-in","bookingsPct":<number>,"coversPct":<number>}],"daily":[{"day":<int 1-31>,"bookings":<int>,"covers":<int>}]}

CHANNELS: each booking channel with its share of BOOKINGS and COVERS as PERCENT NUMBERS ("64.6%" -> 64.6). Keep names exactly; ignore any TOTAL row.
DAILY: one object per day (1..31) with that day's booking and cover counts as integers; read a day-by-day table, not a chart.
Never invent numbers. Return ONLY the JSON.`;

function systemFor(mode: AcquisitionMode): string {
  if (mode === "channels") return CHANNELS_SYSTEM;
  if (mode === "daily") return DAILY_SYSTEM;
  return BOTH_SYSTEM;
}

function userFor(mode: AcquisitionMode, hasText: boolean): string {
  const src = hasText ? "this data" : "the attached image";
  if (mode === "channels") return `Extract the acquisition channel split (name, booking %, cover %) from ${src}.`;
  if (mode === "daily") return `Extract the daily bookings and covers (one per day, 1..31) from ${src}.`;
  return `Extract the acquisition channel split and any daily bookings/covers from ${src}.`;
}

export async function extractAcquisition(
  input: { text?: string | null; image?: GroqImage | null; mode?: AcquisitionMode },
): Promise<
  | { ok: true; channels: NormalChannelRow[]; daily: NormalDailyRow[]; approximate: boolean }
  | { ok: false; error: string }
> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const mode: AcquisitionMode = input.mode ?? "both";
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the data or attach a screenshot/file first." };
  }

  try {
    const raw = await groqChat({
      system: systemFor(mode),
      user: text ? `${userFor(mode, true)}\n\n${text}` : userFor(mode, false),
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 3000,
    });
    const parsed = parseJsonLoose(raw) as { channels?: unknown; daily?: unknown; fromChart?: unknown };
    const channelRows = mode === "daily" || !Array.isArray(parsed?.channels) ? [] : (parsed.channels as never[]);
    const dailyRows = mode === "channels" || !Array.isArray(parsed?.daily) ? [] : (parsed.daily as never[]);
    const { rows: channels } = normalizeChannelRows(channelRows);
    const { rows: daily } = normalizeDailyRows(dailyRows);
    const approximate = daily.length > 0 && parsed?.fromChart === true;

    if (channels.length === 0 && daily.length === 0) {
      const hint =
        mode === "daily"
          ? "Couldn't read a daily table. Paste or screenshot the day-by-day Bookings/Covers NUMBERS (e.g. the spreadsheet table behind the chart). Reading exact values off the chart line is unreliable."
          : mode === "channels"
            ? "Couldn't read the channel split. Upload the channel list with each channel's Booking % and Cover % (a small table or the pie legend)."
            : "Couldn't read a channel split or a daily table. Upload the NUMBERS (a channel list with Booking %/Cover %, or a day-by-day Bookings/Covers table), or paste them as text.";
      return { ok: false, error: hint };
    }
    return { ok: true, channels, daily, approximate };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
