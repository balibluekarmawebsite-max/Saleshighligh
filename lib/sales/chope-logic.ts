/**
 * Pure normalisation for the Restaurant "Chope Reservations" upload. The report
 * is assembled from four parts that all feed one editable form + a daily series:
 *   1. Traffic funnel  — bookings + covers per status (fulfilled / cancelled /
 *      no-show / upcoming / walk-ins)
 *   2. Revenue         — Chope revenue + its % of restaurant revenue
 *   3. Booking sources — Chope/Grab (platform) vs Restaurant channels (direct),
 *      bookings + covers
 *   4. Daily online bookings — platform vs direct per day-of-month
 * Parts 1–3 are scalar fields of a single ChopeReport row; part 4 is ChopeDaily.
 * Everything derived (average party size, totals, mix %) is computed on read.
 */

import { normalizeNumber } from "@/lib/import/number";

/** Whole count, Indonesian/US aware ("1.234" → 1234). */
export const toInt = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : Math.round(n);
};

/** Money as a number ("9.805.025" → 9805025, "Rp 9,805,025" → 9805025). */
export const toNum = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : n;
};

/** A percentage as a plain number ("5.73%" → 5.73), clamped to [0, 100]. */
export const toPct = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : Math.min(100, Math.max(0, n));
};

const firstDefined = (o: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) {
    const x = o[k];
    if (x !== undefined && x !== null && String(x).trim() !== "") return x;
  }
  return undefined;
};

/** A count field, tolerant of a few alias keys, defaulting to 0. */
const count = (o: Record<string, unknown>, ...keys: string[]): number => {
  const n = toInt(firstDefined(o, ...keys));
  return n == null ? 0 : Math.max(0, n);
};

export interface ChopeCore {
  fulfilledBookings: number;
  fulfilledCovers: number;
  cancelledBookings: number;
  cancelledCovers: number;
  noShows: number; // no-show bookings
  noShowCovers: number;
  upcomingBookings: number;
  upcomingCovers: number;
  walkinBookings: number;
  walkinCovers: number;
  revenue: number;
  revenuePct: number | null;
  platformBookings: number;
  platformCovers: number;
  directBookings: number;
  directCovers: number;
}

/** Coerce the (possibly partial, possibly AI-keyed) scalar inputs into the full
 * ChopeReport shape. Missing counts default to 0; an absent revenue % is null. */
export function coerceChopeCore(raw: unknown): ChopeCore {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const rev = toNum(firstDefined(o, "revenue", "chopeRevenue", "revenueIdr"));
  const pct = toPct(firstDefined(o, "revenuePct", "revenuePercent", "percentage", "percent", "revenueShare"));
  return {
    fulfilledBookings: count(o, "fulfilledBookings", "fulfilled_bookings"),
    fulfilledCovers: count(o, "fulfilledCovers", "fulfilled_covers"),
    cancelledBookings: count(o, "cancelledBookings", "cancelled_bookings", "canceledBookings"),
    cancelledCovers: count(o, "cancelledCovers", "cancelled_covers", "canceledCovers"),
    noShows: count(o, "noShowBookings", "noShows", "noshowBookings", "no_show_bookings"),
    noShowCovers: count(o, "noShowCovers", "noshowCovers", "no_show_covers"),
    upcomingBookings: count(o, "upcomingBookings", "upcoming_bookings"),
    upcomingCovers: count(o, "upcomingCovers", "upcoming_covers"),
    walkinBookings: count(o, "walkinBookings", "walkInBookings", "walk_in_bookings"),
    walkinCovers: count(o, "walkinCovers", "walkInCovers", "walk_in_covers"),
    revenue: rev == null ? 0 : Math.max(0, rev),
    revenuePct: pct,
    platformBookings: count(o, "platformBookings", "chopeGrabBookings", "chope_grab_bookings", "onlineBookings"),
    platformCovers: count(o, "platformCovers", "chopeGrabCovers", "chope_grab_covers", "onlineCovers"),
    directBookings: count(o, "directBookings", "restaurantChannelBookings", "restaurant_channels_bookings"),
    directCovers: count(o, "directCovers", "restaurantChannelCovers", "restaurant_channels_covers"),
  };
}

// ─── Daily online bookings ───────────────────────────────────────────────────

export interface RawChopeDailyRow {
  day?: unknown;
  platformBookings?: unknown;
  directBookings?: unknown;
}

export interface NormalChopeDailyRow {
  day: number; // 1–31
  platformBookings: number;
  directBookings: number;
}

const DAY_KEYS = ["day", "date", "dayOfMonth", "d"];
const PLATFORM_KEYS = ["platformBookings", "platform", "chopeGrab", "chope_grab", "online", "chope"];
const DIRECT_KEYS = ["directBookings", "direct", "restaurantChannels", "restaurant_channels", "restaurant"];

/** Normalise daily online-booking rows: day 1–31 with platform + direct counts,
 * de-duped by day (last wins), sorted. A day missing both counts is dropped. */
export function normalizeChopeDaily(raw: RawChopeDailyRow[]): { rows: NormalChopeDailyRow[]; skipped: number } {
  const byDay = new Map<number, NormalChopeDailyRow>();
  let skipped = 0;

  for (const r of raw ?? []) {
    if (r == null || typeof r !== "object") {
      skipped += 1;
      continue;
    }
    const o = r as Record<string, unknown>;
    const day = toInt(firstDefined(o, ...DAY_KEYS));
    const platform = toInt(firstDefined(o, ...PLATFORM_KEYS));
    const direct = toInt(firstDefined(o, ...DIRECT_KEYS));
    // A day needs at least one of the two counts; the other defaults to 0.
    if (day == null || day < 1 || day > 31 || (platform == null && direct == null)) {
      skipped += 1;
      continue;
    }
    byDay.set(day, {
      day,
      platformBookings: Math.max(0, platform ?? 0),
      directBookings: Math.max(0, direct ?? 0),
    });
  }

  const rows = [...byDay.values()].sort((a, b) => a.day - b.day);
  return { rows, skipped };
}

// ─── Derived ─────────────────────────────────────────────────────────────────

/** Average party size = covers / bookings (null when 0 bookings). */
export function averagePartySize(covers: number, bookings: number): number | null {
  return bookings > 0 ? covers / bookings : null;
}
