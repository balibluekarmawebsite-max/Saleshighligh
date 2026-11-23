/**
 * Pure normalisation for the Booking.com "Booking Window" insight — reservation
 * share and ADR by booking lead-time bucket (how far ahead guests book),
 * property vs the overall market. One normalised row per bucket plus the
 * report-level metadata (window label, data-as-of, total booked rooms).
 */

import { normalizeNumber } from "@/lib/import/number";

/** Canonical lead-time buckets, in chart order. */
export const BOOKING_WINDOW_BUCKETS = [
  "0–1 day",
  "2–3 days",
  "4–7 days",
  "8–14 days",
  "15–30 days",
  "31–60 days",
  "61–90 days",
  "91+ days",
  "Unspecified",
] as const;

const RANGE_TO_BUCKET: Record<string, string> = {
  "0-1": "0–1 day",
  "2-3": "2–3 days",
  "4-7": "4–7 days",
  "8-14": "8–14 days",
  "15-30": "15–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
};

const BUCKET_INDEX = new Map<string, number>(BOOKING_WINDOW_BUCKETS.map((b, i) => [b, i]));

/** Map a free-form bucket label to one of the canonical buckets, or null. */
export function canonicalBucket(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[–—]/g, "-").replace(/\s+/g, " ");
  if (s === "") return null;
  if (s.startsWith("unspecified") || s.includes("not specified")) return "Unspecified";
  if (s.includes("91") && s.includes("+")) return "91+ days";
  const range = /(\d+)\s*-\s*(\d+)/.exec(s);
  if (range) return RANGE_TO_BUCKET[`${range[1]}-${range[2]}`] ?? null;
  return null;
}

/** A percent 0–100 (reservation share), default 0, clamped. */
export const toPct = (v: unknown): number => {
  const n = normalizeNumber(v);
  return n == null ? 0 : Math.min(100, Math.max(0, n));
};
/** Money (IDR) ≥ 0, default 0. */
export const toMoney = (v: unknown): number => {
  const n = normalizeNumber(v);
  return n == null ? 0 : Math.max(0, n);
};
/** A whole count ≥ 0, default 0. */
export const toCount = (v: unknown): number => {
  const n = normalizeNumber(v);
  return n == null ? 0 : Math.max(0, Math.round(n));
};

/** Parse a "data as of" date to "YYYY-MM-DD", else null. Accepts ISO,
 *  "3 November 2026", "Nov 3, 2026". */
export function parseAsOfDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : s;
  }
  const t = Date.parse(s);
  if (Number.isNaN(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

export interface RawBookingWindowRow {
  bucket?: unknown;
  propertyShare?: unknown;
  marketShare?: unknown;
  propertyAdr?: unknown;
  marketAdr?: unknown;
}

export interface NormalBookingWindowRow {
  bucket: string;
  propertySharePct: number;
  marketSharePct: number;
  propertyAdr: number;
  marketAdr: number;
}

export interface RawBookingWindowMeta {
  window?: unknown;
  dataAsOf?: unknown;
  totalBookedRooms?: unknown;
}

export interface NormalBookingWindowMeta {
  windowLabel: string;
  dataAsOf: string | null; // "YYYY-MM-DD"
  totalBookedRooms: number;
}

/** Normalise report metadata; a blank window label defaults to "Last 90 days". */
export function normalizeBookingWindowMeta(raw: RawBookingWindowMeta): NormalBookingWindowMeta {
  const windowLabel = String(raw.window ?? "").trim() || "Last 90 days";
  return {
    windowLabel,
    dataAsOf: parseAsOfDate(raw.dataAsOf),
    totalBookedRooms: toCount(raw.totalBookedRooms),
  };
}

/**
 * Normalise raw bucket rows: keep rows with a recognised bucket (zero values are
 * kept so the chart x-axis stays complete), dedupe by bucket (last wins), sort
 * in canonical bucket order.
 */
export function normalizeBookingWindowRows(rows: RawBookingWindowRow[]): NormalBookingWindowRow[] {
  const byBucket = new Map<string, NormalBookingWindowRow>();
  for (const r of rows) {
    const bucket = canonicalBucket(r.bucket);
    if (!bucket) continue;
    byBucket.set(bucket, {
      bucket,
      propertySharePct: toPct(r.propertyShare),
      marketSharePct: toPct(r.marketShare),
      propertyAdr: toMoney(r.propertyAdr),
      marketAdr: toMoney(r.marketAdr),
    });
  }
  return [...byBucket.values()].sort(
    (a, b) => (BUCKET_INDEX.get(a.bucket) ?? 99) - (BUCKET_INDEX.get(b.bucket) ?? 99),
  );
}

/** True when at least one bucket carries a non-zero share or ADR. */
export function bookingWindowHasData(rows: NormalBookingWindowRow[]): boolean {
  return rows.some(
    (r) => r.propertySharePct > 0 || r.marketSharePct > 0 || r.propertyAdr > 0 || r.marketAdr > 0,
  );
}
