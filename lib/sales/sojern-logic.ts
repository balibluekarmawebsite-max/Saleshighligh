/**
 * Pure normalisation for the Sojern "Market Overview" — the Flight and Hotel
 * Volume Indices (travel-demand to the property's destination, as a % difference
 * vs a baseline month), one point per (metric, year, month), plus the filter
 * context (destination, origin country, event type, time period).
 */

import { normalizeNumber } from "@/lib/import/number";

export const SOJERN_METRICS = ["FLIGHT", "HOTEL"] as const;
export type SojernMetric = (typeof SOJERN_METRICS)[number];

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const MONTH_FULL = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/** Map a free-form metric label to "FLIGHT" or "HOTEL", else null. */
export function canonicalMetric(raw: unknown): SojernMetric | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "") return null;
  if (s.startsWith("flight") || s === "air" || s.startsWith("air ")) return "FLIGHT";
  if (s.startsWith("hotel") || s.startsWith("accommod") || s.startsWith("lodg")) return "HOTEL";
  return null;
}

/** A month number 1–12 from an int or a month name, else null. */
export function parseMonth(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.round(raw);
    return n >= 1 && n <= 12 ? n : null;
  }
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "") return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    return n >= 1 && n <= 12 ? n : null;
  }
  const idx = MONTH_FULL.findIndex((m) => m.startsWith(s) || m.slice(0, 3) === s.slice(0, 3));
  return idx >= 0 ? idx + 1 : null;
}

/** A signed percent (vs baseline; can be negative; 0 is valid), null when blank/unreadable. */
export function toSignedPct(v: unknown): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = normalizeNumber(v);
  return n == null ? null : n;
}

/** A 4-digit year in a sensible range, else null. */
export function parseYear(raw: unknown): number | null {
  const n = normalizeNumber(raw);
  if (n == null) return null;
  const y = Math.round(n);
  return y >= 2000 && y <= 2100 ? y : null;
}

export interface RawSojernMeta {
  destination?: unknown;
  originCountry?: unknown;
  eventType?: unknown;
  timePeriod?: unknown;
  baselineLabel?: unknown;
}

export interface NormalSojernMeta {
  destination: string;
  originCountry: string;
  eventType: string;
  timePeriod: string;
  baselineLabel: string;
}

export function normalizeSojernMeta(raw: RawSojernMeta): NormalSojernMeta {
  const t = (v: unknown, fallback: string) => {
    const s = String(v ?? "").trim();
    return s === "" ? fallback : s;
  };
  return {
    destination: t(raw.destination, "—"),
    originCountry: t(raw.originCountry, "(All)"),
    eventType: t(raw.eventType, "Booking"),
    timePeriod: t(raw.timePeriod, "Monthly"),
    baselineLabel: t(raw.baselineLabel, "Jan 2023"),
  };
}

export interface RawSojernPoint {
  metric?: unknown;
  year?: unknown;
  month?: unknown;
  value?: unknown;
}

export interface NormalSojernPoint {
  metric: SojernMetric;
  year: number;
  month: number; // 1–12
  valuePct: number;
}

/**
 * Normalise raw index points: keep rows with a valid metric, year, month AND a
 * numeric value (0 is valid). Dedupe by (metric, year, month), last wins; sort
 * by metric, year, month.
 */
export function normalizeSojernPoints(rows: RawSojernPoint[]): NormalSojernPoint[] {
  const byKey = new Map<string, NormalSojernPoint>();
  for (const r of rows) {
    const metric = canonicalMetric(r.metric);
    const year = parseYear(r.year);
    const month = parseMonth(r.month);
    const valuePct = toSignedPct(r.value);
    if (metric == null || year == null || month == null || valuePct == null) continue;
    byKey.set(`${metric}-${year}-${month}`, { metric, year, month, valuePct });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      (a.metric < b.metric ? -1 : a.metric > b.metric ? 1 : 0) || a.year - b.year || a.month - b.month,
  );
}

/** True when at least one index point exists. */
export function sojernHasData(points: NormalSojernPoint[]): boolean {
  return points.length > 0;
}
