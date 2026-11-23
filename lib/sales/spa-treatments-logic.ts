/**
 * Pure normalisation for the Spa "Top Treatments" upload. Turns raw rows (from
 * an AI extraction or a manual grid) into the per-treatment PERSON (count) +
 * REVENUE that SpaTreatment stores. The "%" share and the AVERAGE CHECK columns
 * are DERIVED (count / total, revenue / count), so only those two raw numbers
 * per treatment are persisted.
 */

import { toInt, toNum } from "@/lib/sales/restaurant-sources-logic";

export interface RawTreatmentRow {
  treatmentName?: unknown;
  count?: unknown;
  revenue?: unknown;
}

export interface NormalTreatmentRow {
  treatmentName: string;
  count: number;
  revenue: number;
}

export interface TreatmentNormalizeResult {
  rows: NormalTreatmentRow[];
  skipped: number;
}

/** A TOTAL / GRAND TOTAL row is derived — never stored. */
const TOTAL_RE = /^(grand\s+)?total$/i;

/**
 * Normalise treatment rows: require a (non-TOTAL) name plus a parseable count
 * and revenue, drop the rest, and keep the LAST row per treatment name
 * (case-insensitive — a correction wins). Input order is preserved.
 */
export function normalizeTreatmentRows(raw: RawTreatmentRow[]): TreatmentNormalizeResult {
  const byKey = new Map<string, NormalTreatmentRow>();
  let skipped = 0;

  for (const r of raw ?? []) {
    if (r == null || typeof r !== "object") {
      skipped += 1;
      continue;
    }
    const treatmentName = String(r.treatmentName ?? "").trim();
    const count = toInt(r.count);
    const revenue = toNum(r.revenue);
    if (!treatmentName || TOTAL_RE.test(treatmentName) || count == null || revenue == null) {
      skipped += 1;
      continue;
    }
    byKey.set(treatmentName.toLowerCase(), {
      treatmentName,
      count: Math.max(0, count),
      revenue: Math.max(0, revenue),
    });
  }

  return { rows: [...byKey.values()], skipped };
}

export interface TreatmentTotals {
  count: number;
  revenue: number;
  /** Blended average check = total revenue / total count (null when 0 count). */
  avgCheck: number | null;
}

/** Column totals for the TOTAL row (count, revenue, blended average check). */
export function treatmentTotals(rows: { count: number; revenue: number }[]): TreatmentTotals {
  const count = rows.reduce((s, r) => s + r.count, 0);
  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  return { count, revenue, avgCheck: count > 0 ? revenue / count : null };
}

/** Per-row average check (revenue / count), null when 0 count. */
export function treatmentAvgCheck(row: { count: number; revenue: number }): number | null {
  return row.count > 0 ? row.revenue / row.count : null;
}

/** Per-row share of total persons as a 0–100 percent. */
export function treatmentPct(row: { count: number }, totalCount: number): number {
  return totalCount > 0 ? (row.count / totalCount) * 100 : 0;
}
