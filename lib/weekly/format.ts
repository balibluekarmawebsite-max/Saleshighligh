/**
 * Display formatting for the Weekly Reports module.
 *
 * Money reuses the shared IDR formatters (thousand separators, no decimals).
 * Percentages use **2 decimal places** (matching the monthly Sales Highlight and
 * the Section B grid), so occupancy and share read consistently across the app.
 * Empty values render as an em dash.
 */

import { formatIDR, formatIDRCompact, formatNumber } from "@/lib/format";

export { formatIDR, formatIDRCompact, formatNumber };

/** Placeholder shown for any null/undefined value. */
export const EMPTY = "—";

/** Percent to 2 decimal places, e.g. 72.5 → "72.50%". */
export function formatWeeklyPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  return `${value.toFixed(2)}%`;
}

/** Signed variance percent to 1 decimal, e.g. -8.4 → "-8.4%", 3 → "+3.0%". */
export function formatWeeklyVariance(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Tailwind text-color class for a variance value: green when positive, red when
 * negative, muted when zero/empty. Matches the monthly dashboard's semantics.
 */
export function weeklyVarianceColor(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
    return "text-muted-foreground";
  }
  return value > 0 ? "text-variance-positive" : "text-variance-negative";
}
