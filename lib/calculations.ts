/**
 * Pure business calculations for the BK Sales Dashboard.
 *
 * The database stores only RAW inputs (see prisma/schema.prisma). Every derived
 * metric is computed here so the logic is unit-tested and reused across server
 * components, API routes, and the report exporter. All functions are pure and
 * free of side effects.
 *
 * Conventions:
 *   - Amounts and rates are plain `number` (convert Prisma `Decimal` with
 *     `.toNumber()` at the call site).
 *   - Percentage-returning functions return whole percents (e.g. 78.4 → 78.4%),
 *     not ratios.
 *   - Any calculation with a zero/invalid denominator returns `null` rather
 *     than `Infinity`/`NaN`, so callers can render a placeholder.
 */

/** Safe division: returns null when the denominator is 0 or inputs are invalid. */
function safeDivide(
  numerator: number | null | undefined,
  denominator: number | null | undefined,
): number | null {
  if (
    numerator === null ||
    numerator === undefined ||
    denominator === null ||
    denominator === undefined ||
    denominator === 0 ||
    Number.isNaN(numerator) ||
    Number.isNaN(denominator)
  ) {
    return null;
  }
  return numerator / denominator;
}

/** Absolute variance of actual against budget (actual − budget). */
export function variance(actual: number, budget: number): number {
  return actual - budget;
}

/**
 * Achievement of target: actual as a percentage of budget.
 * @example achievementPct(78, 100) // 78
 */
export function achievementPct(
  actual: number,
  budget: number,
): number | null {
  const ratio = safeDivide(actual, budget);
  return ratio === null ? null : ratio * 100;
}

/**
 * Signed variance as a percentage of budget ((actual − budget) / budget × 100).
 * Negative = under budget (render red), positive = over budget (render green).
 * @example variancePct(78, 100) // -22
 */
export function variancePct(actual: number, budget: number): number | null {
  const ratio = safeDivide(actual - budget, budget);
  return ratio === null ? null : ratio * 100;
}

/** Revenue per available room = room revenue / rooms available. */
export function revpar(
  roomRevenue: number,
  roomsAvailable: number,
): number | null {
  return safeDivide(roomRevenue, roomsAvailable);
}

/** Average daily rate = room revenue / room nights sold. */
export function adr(roomRevenue: number, roomNights: number): number | null {
  return safeDivide(roomRevenue, roomNights);
}

/**
 * Return on ad spend as a ratio (tracked revenue / spend).
 * Multiply by 100 for the percentage form used in the source workbooks.
 * @example roas(92_402_552, 947_324) // ≈ 97.54
 */
export function roas(trackedRevenue: number, spend: number): number | null {
  return safeDivide(trackedRevenue, spend);
}

/** Click-through rate as a percentage (clicks / impressions × 100). */
export function ctr(clicks: number, impressions: number): number | null {
  const ratio = safeDivide(clicks, impressions);
  return ratio === null ? null : ratio * 100;
}

/** Cost per click = spend / clicks. */
export function cpc(spend: number, clicks: number): number | null {
  return safeDivide(spend, clicks);
}

/** Average check = revenue / covers. */
export function avgCheck(revenue: number, covers: number): number | null {
  return safeDivide(revenue, covers);
}

/**
 * Month-over-month change as a percentage ((current − previous) / previous × 100).
 * @example momChange(120, 100) // 20
 */
export function momChange(current: number, previous: number): number | null {
  const ratio = safeDivide(current - previous, previous);
  return ratio === null ? null : ratio * 100;
}

/**
 * Running year-to-date totals. Given monthly values in chronological order,
 * returns the cumulative sum at each month.
 * @example ytdAccumulate([10, 20, 30]) // [10, 30, 60]
 */
export function ytdAccumulate(monthly: number[]): number[] {
  let runningTotal = 0;
  return monthly.map((value) => {
    runningTotal += value;
    return runningTotal;
  });
}
