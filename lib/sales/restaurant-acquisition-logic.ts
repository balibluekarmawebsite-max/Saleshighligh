/**
 * Pure normalisation for the Restaurant "Acquisition Split" upload. Two kinds of
 * raw input, both stored as given and everything else derived:
 *
 *  - Channel rows: free-text channel (Walk-in / Repeater / Chope / Phone-WA /
 *    Catering / anything) with a Booking % and a Cover %. The channel set can
 *    differ every month, so the channel is NOT a fixed enum. Percentages are
 *    stored as ratios (0–1) and shown ×100, matching FnbAcquisition.
 *  - Daily rows: day-of-month (1–31) with that day's bookings and covers (the
 *    "Cover vs Booking" chart).
 */

import { normalizeNumber } from "@/lib/import/number";

/** Whole count (covers / bookings / day), Indonesian/US aware. */
export const toInt = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : Math.round(n);
};

/**
 * Parse a percentage into a stored ratio (0–1). The source always provides
 * percentages — "64.6%", "64,6%", "64.6", "3.6", "0.4" — so the value is always
 * read as a percent and divided by 100 (the "%" and any thousands separators are
 * stripped by the shared number parser). Clamped to [0, 1].
 */
export function parsePctToRatio(v: unknown): number | null {
  let n: number | null;
  if (typeof v === "number") {
    n = Number.isFinite(v) ? v : null;
  } else {
    const s = String(v ?? "").trim();
    if (s === "") return null;
    n = normalizeNumber(s); // strips "%", keeps the decimal (64.6 / 3.6 / 0.4)
  }
  if (n == null) return null;
  return Math.min(1, Math.max(0, n / 100));
}

const TOTAL_RE = /^(grand\s+)?total$/i;

// ─── Channel rows ────────────────────────────────────────────────────────────

export interface RawChannelRow {
  channel?: unknown;
  bookingsPct?: unknown;
  coversPct?: unknown;
}

export interface NormalChannelRow {
  channel: string;
  /** stored as a ratio 0–1 */
  bookingsPct: number;
  coversPct: number;
}

export interface ChannelNormalizeResult {
  rows: NormalChannelRow[];
  skipped: number;
}

/**
 * Normalise acquisition channel rows: require a (non-TOTAL) channel name plus a
 * parseable Booking % and Cover %, de-dupe by channel (case-insensitive, last
 * wins), preserve input order.
 */
export function normalizeChannelRows(raw: RawChannelRow[]): ChannelNormalizeResult {
  const byKey = new Map<string, NormalChannelRow>();
  let skipped = 0;

  for (const r of raw ?? []) {
    if (r == null || typeof r !== "object") {
      skipped += 1;
      continue;
    }
    const channel = String(r.channel ?? "").trim();
    const bookingsPct = parsePctToRatio(r.bookingsPct);
    const coversPct = parsePctToRatio(r.coversPct);
    if (!channel || TOTAL_RE.test(channel) || bookingsPct == null || coversPct == null) {
      skipped += 1;
      continue;
    }
    byKey.set(channel.toLowerCase(), { channel, bookingsPct, coversPct });
  }

  return { rows: [...byKey.values()], skipped };
}

// ─── Daily rows ──────────────────────────────────────────────────────────────

export interface RawDailyRow {
  day?: unknown;
  bookings?: unknown;
  covers?: unknown;
}

export interface NormalDailyRow {
  day: number; // 1–31
  bookings: number;
  covers: number;
}

export interface DailyNormalizeResult {
  rows: NormalDailyRow[];
  skipped: number;
}

/**
 * Normalise daily cover/booking rows: require a day in 1–31 plus parseable
 * bookings and covers, de-dupe by day (last wins), return sorted by day.
 */
export function normalizeDailyRows(raw: RawDailyRow[]): DailyNormalizeResult {
  const byDay = new Map<number, NormalDailyRow>();
  let skipped = 0;

  for (const r of raw ?? []) {
    if (r == null || typeof r !== "object") {
      skipped += 1;
      continue;
    }
    const day = toInt(r.day);
    const bookings = toInt(r.bookings);
    const covers = toInt(r.covers);
    if (day == null || day < 1 || day > 31 || bookings == null || covers == null) {
      skipped += 1;
      continue;
    }
    byDay.set(day, { day, bookings: Math.max(0, bookings), covers: Math.max(0, covers) });
  }

  const rows = [...byDay.values()].sort((a, b) => a.day - b.day);
  return { rows, skipped };
}

// ─── Labels & ordering ───────────────────────────────────────────────────────

/** Known channel keys → display label; any other (free-text) name passes through. */
const CHANNEL_LABELS: Record<string, string> = {
  WALK_IN: "Walk-in",
  "WALK-IN": "Walk-in",
  WALKIN: "Walk-in",
  REPEATER: "Repeater",
  CHOPE: "Chope",
  CATERING: "Catering",
  PHONE_WA: "Phone/WA",
  "PHONE/WA": "Phone/WA",
  PHONEWA: "Phone/WA",
};

export function channelLabel(name: string): string {
  const key = name.trim().toUpperCase().replace(/\s+/g, "_");
  return CHANNEL_LABELS[name.trim().toUpperCase()] ?? CHANNEL_LABELS[key] ?? name.trim();
}

/** Preferred display order for the common channels; unknown channels sort after. */
const CHANNEL_ORDER = ["walk-in", "repeater", "chope", "phone/wa", "catering"];

export function channelSortKey(name: string): number {
  const i = CHANNEL_ORDER.indexOf(channelLabel(name).toLowerCase());
  return i === -1 ? CHANNEL_ORDER.length : i;
}
