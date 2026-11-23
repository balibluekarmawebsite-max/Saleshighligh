/**
 * Pure normalisation for the Booking.com "Market Area Update" — the monthly
 * Sales-statistics chart comparing the PROPERTY against the overall MARKET on
 *   - Room nights (property vs market), and
 *   - Average daily rate in IDR (property vs market).
 * One normalised row per month; the whole series is stored under the report
 * period being edited (MarketAreaStat, keyed by statMonth).
 */

import { normalizeNumber } from "@/lib/import/number";

const MONTH_RE = /^\d{4}-\d{2}$/;
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** A whole count ≥ 0, else null. */
export const toCount = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : Math.max(0, Math.round(n));
};
/** Money (IDR) ≥ 0, else null. */
export const toMoney = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : Math.max(0, n);
};

/**
 * Parse a month label to a "YYYY-MM" key. Accepts "2026-10", "2026/10",
 * "Oct 2026", "October 2026", "10/2026". Returns null when unreadable.
 */
export function parseStatMonth(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;

  const iso = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    if (m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, "0")}`;
    return null;
  }

  const mYyyy = /^(\d{1,2})[-/](\d{4})$/.exec(s);
  if (mYyyy) {
    const m = Number(mYyyy[1]);
    const y = Number(mYyyy[2]);
    if (m >= 1 && m <= 12) return `${y}-${String(m).padStart(2, "0")}`;
    return null;
  }

  // "Oct 2026" / "October 2026"
  const named = /^([A-Za-z]{3,})\.?\s+(\d{4})$/.exec(s);
  if (named) {
    const name = (named[1] ?? "").toLowerCase();
    const y = Number(named[2]);
    const idx = MONTHS.findIndex((m) => m.startsWith(name) || m.slice(0, 3) === name.slice(0, 3));
    if (idx >= 0) return `${y}-${String(idx + 1).padStart(2, "0")}`;
  }
  return null;
}

/** "YYYY-MM" → the UTC first-of-month Date, or null when malformed. */
export function statMonthToDate(month: string): Date | null {
  if (!MONTH_RE.test(month)) return null;
  const d = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === month ? d : null;
}

/** A Date → "YYYY-MM". */
export function dateToStatMonth(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export interface RawMarketAreaRow {
  month?: unknown;
  propertyRoomNights?: unknown;
  marketRoomNights?: unknown;
  propertyAdr?: unknown;
  marketAdr?: unknown;
}

export interface NormalMarketAreaRow {
  month: string; // "YYYY-MM"
  propertyRoomNights: number;
  marketRoomNights: number;
  propertyAdr: number;
  marketAdr: number;
}

/** True when a raw row carries at least one non-zero value. */
export function marketAreaRowHasData(r: RawMarketAreaRow): boolean {
  return (
    (toCount(r.propertyRoomNights) ?? 0) > 0 ||
    (toCount(r.marketRoomNights) ?? 0) > 0 ||
    (toMoney(r.propertyAdr) ?? 0) > 0 ||
    (toMoney(r.marketAdr) ?? 0) > 0
  );
}

/**
 * Normalise raw rows: keep only those with a valid month AND some data; default
 * each metric to 0; dedupe by month (last wins); sort ascending by month.
 */
export function normalizeMarketAreaRows(rows: RawMarketAreaRow[]): NormalMarketAreaRow[] {
  const byMonth = new Map<string, NormalMarketAreaRow>();
  for (const r of rows) {
    const month = parseStatMonth(r.month);
    if (!month) continue;
    if (!marketAreaRowHasData(r)) continue;
    byMonth.set(month, {
      month,
      propertyRoomNights: toCount(r.propertyRoomNights) ?? 0,
      marketRoomNights: toCount(r.marketRoomNights) ?? 0,
      propertyAdr: toMoney(r.propertyAdr) ?? 0,
      marketAdr: toMoney(r.marketAdr) ?? 0,
    });
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** True when the normalised series has at least one row. */
export function marketAreaHasData(rows: NormalMarketAreaRow[]): boolean {
  return rows.length > 0;
}
