/**
 * Pure normalisation for the Booking.com "Overview" — the search → property-page
 * → booking funnel and search-availability, property vs the overall market. One
 * scalar record per period plus a monthly availability trend (your vs market).
 */

import { normalizeNumber } from "@/lib/import/number";
import { parseAsOfDate } from "@/lib/sales/booking-window-logic";
import { parseStatMonth } from "@/lib/sales/market-area-logic";

/** A whole count ≥ 0, default 0. */
const count = (v: unknown): number => {
  const n = normalizeNumber(v);
  return n == null ? 0 : Math.max(0, Math.round(n));
};
/** A percent 0–100 (conversion / availability), default 0, clamped. */
const pct = (v: unknown): number => {
  const n = normalizeNumber(v);
  return n == null ? 0 : Math.min(100, Math.max(0, n));
};
/** A nullable percent 0–100 (market conversion), null when absent. */
const pctOrNull = (v: unknown): number | null => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = normalizeNumber(v);
  return n == null ? null : Math.min(100, Math.max(0, n));
};
/** A signed "vs market" percent (can be large, e.g. +1140.86), null when absent. No clamp. */
const signed = (v: unknown): number | null => {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = normalizeNumber(v);
  return n == null ? null : n;
};

export interface BookingOverviewCore {
  windowLabel: string;
  dataAsOf: string | null; // "YYYY-MM-DD"
  searchResultsViews: number;
  searchResultsViewsVsMkt: number | null;
  propertyPageVisits: number;
  propertyPageVisitsVsMkt: number | null;
  bookingsMade: number;
  bookingsMadeVsMkt: number | null;
  searchToPagePct: number;
  searchToPageMarketPct: number | null;
  searchToPageVsMkt: number | null;
  pageToBookingPct: number;
  pageToBookingMarketPct: number | null;
  pageToBookingVsMkt: number | null;
  availabilityPct: number;
  availabilityVsMkt: number | null;
}

type RawCore = Record<string, unknown>;

/** Coerce the (possibly partial, possibly AI-keyed) Booking.com overview figures. */
export function coerceBookingOverviewCore(raw: unknown): BookingOverviewCore {
  const o = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as RawCore;
  const windowLabel = String(o.window ?? o.windowLabel ?? "").trim() || "Last 90 days";
  return {
    windowLabel,
    dataAsOf: parseAsOfDate(o.dataAsOf),
    searchResultsViews: count(o.searchResultsViews),
    searchResultsViewsVsMkt: signed(o.searchResultsViewsVsMkt),
    propertyPageVisits: count(o.propertyPageVisits),
    propertyPageVisitsVsMkt: signed(o.propertyPageVisitsVsMkt),
    bookingsMade: count(o.bookingsMade),
    bookingsMadeVsMkt: signed(o.bookingsMadeVsMkt),
    searchToPagePct: pct(o.searchToPagePct),
    searchToPageMarketPct: pctOrNull(o.searchToPageMarketPct),
    searchToPageVsMkt: signed(o.searchToPageVsMkt),
    pageToBookingPct: pct(o.pageToBookingPct),
    pageToBookingMarketPct: pctOrNull(o.pageToBookingMarketPct),
    pageToBookingVsMkt: signed(o.pageToBookingVsMkt),
    availabilityPct: pct(o.availabilityPct),
    availabilityVsMkt: signed(o.availabilityVsMkt),
  };
}

/** True when the overview carries at least one headline figure. */
export function bookingOverviewHasData(c: BookingOverviewCore): boolean {
  return (
    c.searchResultsViews > 0 ||
    c.propertyPageVisits > 0 ||
    c.bookingsMade > 0 ||
    c.availabilityPct > 0 ||
    c.searchToPagePct > 0 ||
    c.pageToBookingPct > 0
  );
}

export interface RawAvailRow {
  month?: unknown;
  yourPct?: unknown;
  marketPct?: unknown;
}

export interface NormalAvailRow {
  month: string; // "YYYY-MM"
  yourPct: number;
  marketPct: number;
}

/** Normalise the monthly availability trend: valid month + some data; dedupe by
 * month (last wins); sort ascending. */
export function normalizeAvailRows(rows: RawAvailRow[]): NormalAvailRow[] {
  const byMonth = new Map<string, NormalAvailRow>();
  for (const r of rows) {
    const month = parseStatMonth(r.month);
    if (!month) continue;
    const yourPct = pct(r.yourPct);
    const marketPct = pct(r.marketPct);
    if (yourPct === 0 && marketPct === 0) continue;
    byMonth.set(month, { month, yourPct, marketPct });
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}
