/**
 * Pure normalisation for the Restaurant "Source of Booking" upload. Turns raw
 * rows (from an AI extraction or a manual grid) into the per-source PERSON
 * (covers) + REVENUE that FnbSourceOfBooking stores. The "%" share and the
 * AVERAGE CHECK columns are DERIVED (persons / total, revenue / persons), so
 * only these two raw numbers per source are persisted.
 */

import { normalizeNumber } from "@/lib/import/number";

/** Whole covers count, Indonesian/US-aware ("844" → 844, "1.749" → 1749). */
export const toInt = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : Math.round(n);
};

/** Money as a (possibly fractional) number, Indonesian/US-aware so
 * "131.285.021" and "131,285,021.00" both read correctly (not inflated). */
export const toNum = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : n;
};

export interface RawSourceRow {
  sourceName?: unknown;
  persons?: unknown;
  revenue?: unknown;
}

export interface NormalSourceRow {
  sourceName: string;
  persons: number;
  revenue: number;
}

export interface SourceNormalizeResult {
  rows: NormalSourceRow[];
  skipped: number;
}

/** A TOTAL / GRAND TOTAL row is derived — never stored. */
const TOTAL_RE = /^(grand\s+)?total$/i;

/**
 * Normalise source-of-booking rows: require a (non-TOTAL) name plus a parseable
 * persons and revenue, drop the rest, and keep the LAST row per source name
 * (case-insensitive — a correction wins). Order is preserved from the input.
 */
export function normalizeSourceRows(raw: RawSourceRow[]): SourceNormalizeResult {
  const byKey = new Map<string, NormalSourceRow>();
  let skipped = 0;

  for (const r of raw ?? []) {
    if (r == null || typeof r !== "object") {
      skipped += 1;
      continue;
    }
    const sourceName = String(r.sourceName ?? "").trim();
    const persons = toInt(r.persons);
    const revenue = toNum(r.revenue);
    if (!sourceName || TOTAL_RE.test(sourceName) || persons == null || revenue == null) {
      skipped += 1;
      continue;
    }
    byKey.set(sourceName.toLowerCase(), {
      sourceName,
      persons: Math.max(0, persons),
      revenue: Math.max(0, revenue),
    });
  }

  return { rows: [...byKey.values()], skipped };
}

export interface SourceTotals {
  persons: number;
  revenue: number;
  /** Blended average check = total revenue / total persons (null when 0 persons). */
  avgCheck: number | null;
}

/** Column totals for the TOTAL row (persons, revenue, blended average check). */
export function sourceTotals(rows: { persons: number; revenue: number }[]): SourceTotals {
  const persons = rows.reduce((s, r) => s + r.persons, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  return { persons, revenue, avgCheck: persons > 0 ? revenue / persons : null };
}

/** Per-row average check (revenue / persons), null when 0 persons. */
export function sourceAvgCheck(row: { persons: number; revenue: number }): number | null {
  return row.persons > 0 ? row.revenue / row.persons : null;
}

/** Per-row share of total persons as a 0–100 percent. */
export function sourcePctPersons(row: { persons: number }, totalPersons: number): number {
  return totalPersons > 0 ? (row.persons / totalPersons) * 100 : 0;
}
