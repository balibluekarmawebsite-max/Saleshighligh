/**
 * Pure business calculations for the Weekly Reports module.
 *
 * Mirrors the monthly dashboard's `lib/calculations.ts` approach — raw inputs
 * in, derived metrics out, every function pure and null-safe: a missing or
 * zero denominator yields `null` (rendered as "—"), never NaN/Infinity. This is
 * a TypeScript port of the weekly app's ReportCalculator / Format / TrendService
 * logic.
 *
 * Conventions:
 *   - Money and counts are plain `number` (convert Prisma `Decimal` with
 *     `.toNumber()` at the call site).
 *   - Occupancy is stored as a fraction (0–1); percentage-returning functions
 *     return whole percents (72.5 → 72.5%).
 */

type Num = number | null | undefined;

function isNum(v: Num): v is number {
  return v !== null && v !== undefined && !Number.isNaN(v);
}

/** Safe division: returns null when the denominator is 0 or inputs are invalid. */
function safeDivide(numerator: Num, denominator: Num): number | null {
  if (!isNum(numerator) || !isNum(denominator) || denominator === 0) return null;
  return numerator / denominator;
}

/** Average room rate / average daily rate = revenue / room nights. */
export function rate(revenue: Num, roomNights: Num): number | null {
  return safeDivide(revenue, roomNights);
}

/** Percentage share of a part against a total (0–100). */
export function sharePercent(part: Num, total: Num): number | null {
  const r = safeDivide(part, total);
  return r === null ? null : r * 100;
}

/** Occupancy fraction (0–1) → whole percent (0–100). */
export function occPercent(fraction: Num): number | null {
  return isNum(fraction) ? fraction * 100 : null;
}

export type Direction = "up" | "down" | "flat";

export interface Variance {
  pct: number | null;
  direction: Direction;
}

/**
 * Variance of `actual` vs `compare`, as a percent of |compare|, plus a
 * direction (flat within ±0.05%). Negative → under budget/LY (render red),
 * positive → over (render green), per the shared convention.
 * @example variance(78, 100) // { pct: -22, direction: "down" }
 */
export function variance(actual: Num, compare: Num): Variance {
  if (!isNum(actual) || !isNum(compare) || compare === 0) {
    return { pct: null, direction: "flat" };
  }
  const pct = ((actual - compare) / Math.abs(compare)) * 100;
  const direction: Direction = pct > 0.05 ? "up" : pct < -0.05 ? "down" : "flat";
  return { pct, direction };
}

/** Just the variance percentage (see {@link variance}). */
export function variancePercent(actual: Num, compare: Num): number | null {
  return variance(actual, compare).pct;
}

export interface ProductionRow {
  rnSold: Num;
  grossRevenue: Num;
}

export interface ProductionTotals {
  rn: number;
  revenue: number;
  arr: number | null;
}

/** Totals for Section C/D / owner-mix rows: Σ room nights, Σ revenue, blended ARR. */
export function productionTotals(rows: ProductionRow[]): ProductionTotals {
  const rn = rows.reduce((s, r) => s + (isNum(r.rnSold) ? r.rnSold : 0), 0);
  const revenue = rows.reduce(
    (s, r) => s + (isNum(r.grossRevenue) ? r.grossRevenue : 0),
    0,
  );
  return { rn, revenue, arr: rate(revenue, rn) };
}

export interface MonthlyStatRow {
  rnSold: Num;
  revActual: Num;
  revBudget: Num;
  revLy: Num;
}

export interface MonthlyTotals {
  rnSold: number;
  revActual: number;
  revBudget: number;
  revLy: number;
  arrActual: number | null;
  arrBudget: number | null;
  arrLy: number | null;
}

/** Section B totals across months (Σ revenue, blended ARR on summed room nights). */
export function monthlyTotals(rows: MonthlyStatRow[]): MonthlyTotals {
  const sum = (pick: (r: MonthlyStatRow) => Num): number =>
    rows.reduce((s, r) => {
      const v = pick(r);
      return s + (isNum(v) ? v : 0);
    }, 0);
  const rnSold = sum((r) => r.rnSold);
  const revActual = sum((r) => r.revActual);
  const revBudget = sum((r) => r.revBudget);
  const revLy = sum((r) => r.revLy);
  return {
    rnSold,
    revActual,
    revBudget,
    revLy,
    arrActual: rate(revActual, rnSold),
    arrBudget: rate(revBudget, rnSold),
    arrLy: rate(revLy, rnSold),
  };
}

/** Year-to-date room nights for a channel row (Σ of the 12 month columns). */
export function channelYtd(months: Num[]): number {
  return months.reduce<number>((s, m) => s + (isNum(m) ? m : 0), 0);
}

/** Social growth (this − last week). Null if either side is missing. */
export function growth(lastWeek: Num, thisWeek: Num): number | null {
  if (!isNum(lastWeek) || !isNum(thisWeek)) return null;
  return thisWeek - lastWeek;
}

/** Social growth as a percentage of last week. Null if last week is 0/missing. */
export function growthPercent(lastWeek: Num, thisWeek: Num): number | null {
  if (!isNum(lastWeek) || lastWeek === 0 || !isNum(thisWeek)) return null;
  return ((thisWeek - lastWeek) / lastWeek) * 100;
}

export interface Delta {
  abs: number | null;
  pct: number | null;
  direction: Direction;
}

/** Week-over-week change between two KPI values. */
export function delta(cur: Num, prev: Num): Delta {
  if (!isNum(cur) || !isNum(prev)) return { abs: null, pct: null, direction: "flat" };
  const abs = cur - prev;
  const pct = prev !== 0 ? (abs / Math.abs(prev)) * 100 : null;
  const direction: Direction = abs > 0 ? "up" : abs < 0 ? "down" : "flat";
  return { abs, pct, direction };
}

export interface HeadlineCandidate {
  month: number;
  hasFigures: boolean;
}

/**
 * The "headline month" for a week so KPIs, narrative and trends all align:
 * the month of the week's end date if it has figures, else the latest month
 * that has figures. Returns null when no month has figures.
 * @example headlineMonth(10, [{month:9,hasFigures:true},{month:10,hasFigures:true}]) // 10
 */
export function headlineMonth(
  endDateMonth: number,
  candidates: HeadlineCandidate[],
): number | null {
  const withFigures = candidates.filter((c) => c.hasFigures);
  if (withFigures.length === 0) return null;
  const atEnd = withFigures.find((c) => c.month === endDateMonth);
  if (atEnd) return atEnd.month;
  return withFigures.reduce((max, c) => (c.month > max ? c.month : max), 0);
}
