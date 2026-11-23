/**
 * Pure normalisation for the Spa "Guest Segment Performance" upload. The spa
 * stores, per guest segment (In-House / Outside / Inclusion), the COVER count
 * and the REVENUE as ACTUAL and BUDGET (SpaSales). The AVERAGE CHECK, the "%"
 * shares and the variance columns are DERIVED (revenue / covers, actual vs
 * budget), so only those four raw numbers per segment are persisted.
 */

import { toInt, toNum } from "@/lib/sales/restaurant-sources-logic";

export const SPA_SEGMENTS = ["IN_HOUSE", "OUTSIDE", "INCLUSION"] as const;
export type SpaSegment = (typeof SPA_SEGMENTS)[number];

export const SPA_SEGMENT_LABEL: Record<SpaSegment, string> = {
  IN_HOUSE: "In-House",
  OUTSIDE: "Outside",
  INCLUSION: "Inclusion",
};

export interface RawSpaPerfRow {
  segment?: unknown;
  coversActual?: unknown;
  coversBudget?: unknown;
  revenueActual?: unknown;
  revenueBudget?: unknown;
}

export interface NormalSpaPerfRow {
  segment: SpaSegment;
  coversActual: number;
  coversBudget: number;
  revenueActual: number;
  revenueBudget: number;
}

const clampInt = (v: unknown): number => Math.max(0, toInt(v) ?? 0);
const clampNum = (v: unknown): number => Math.max(0, toNum(v) ?? 0);

/** Map a free-form segment label to the enum. Tolerant of "Inhouse Guest",
 * "In House", "Outside Guest", "Outsider", "Inclusion Guest". */
export function coerceSpaSegment(v: unknown): SpaSegment | null {
  if (typeof v === "string" && (SPA_SEGMENTS as readonly string[]).includes(v)) return v as SpaSegment;
  const s = String(v ?? "").toLowerCase();
  if (/in[\s-]?house/.test(s)) return "IN_HOUSE";
  if (/inclusion|inclusive/.test(s)) return "INCLUSION";
  if (/outside|outsider|external/.test(s)) return "OUTSIDE";
  return null;
}

/**
 * Normalise raw rows into the fixed segments (last non-empty row wins per
 * segment). A segment with no values at all is dropped; remaining segments are
 * returned in the fixed SPA_SEGMENTS order.
 */
export function normalizeSpaPerf(raw: RawSpaPerfRow[]): NormalSpaPerfRow[] {
  const bySeg = new Map<SpaSegment, NormalSpaPerfRow>();
  for (const r of raw ?? []) {
    if (r == null || typeof r !== "object") continue;
    const segment = coerceSpaSegment(r.segment);
    if (!segment) continue;
    const row: NormalSpaPerfRow = {
      segment,
      coversActual: clampInt(r.coversActual),
      coversBudget: clampInt(r.coversBudget),
      revenueActual: clampNum(r.revenueActual),
      revenueBudget: clampNum(r.revenueBudget),
    };
    if (row.coversActual || row.coversBudget || row.revenueActual || row.revenueBudget) {
      bySeg.set(segment, row);
    }
  }
  return SPA_SEGMENTS.filter((s) => bySeg.has(s)).map((s) => bySeg.get(s)!);
}

/** Average check = revenue / covers, null when 0 covers. */
export function avgCheck(revenue: number, covers: number): number | null {
  return covers > 0 ? revenue / covers : null;
}

/** Signed variance % = (actual − budget) / budget × 100, null when budget 0. */
export function variancePct(actual: number, budget: number): number | null {
  return budget !== 0 ? ((actual - budget) / budget) * 100 : null;
}

export interface SpaPerfTotals {
  coversActual: number;
  coversBudget: number;
  revenueActual: number;
  revenueBudget: number;
}

/** Column totals across segments (covers + revenue, actual + budget). */
export function spaPerfTotals(rows: NormalSpaPerfRow[]): SpaPerfTotals {
  return (rows ?? []).reduce<SpaPerfTotals>(
    (t, r) => ({
      coversActual: t.coversActual + r.coversActual,
      coversBudget: t.coversBudget + r.coversBudget,
      revenueActual: t.revenueActual + r.revenueActual,
      revenueBudget: t.revenueBudget + r.revenueBudget,
    }),
    { coversActual: 0, coversBudget: 0, revenueActual: 0, revenueBudget: 0 },
  );
}
