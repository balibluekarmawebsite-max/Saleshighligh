/**
 * Shared formatting helpers for the BK Sales Dashboard.
 *
 * Conventions (see CLAUDE.md):
 *   - All money is IDR, formatted with thousand separators, no decimals.
 *   - Percentages are shown to 2 decimal places.
 *   - Negative variances render red, positive variances render green.
 */

const IDR_FORMATTER = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format a value as IDR with thousand separators and no decimals.
 * @example formatIDR(1500000) // "Rp 1.500.000"
 */
export function formatIDR(value: number | bigint | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  return IDR_FORMATTER.format(Number(value));
}

/**
 * Compact IDR for tight spaces (axis labels, chips), e.g. "Rp 1,5 M".
 * Uses millions (M) and billions (B) scaling.
 */
export function formatIDRCompact(
  value: number | bigint | null | undefined,
): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "—";
  }
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)} B`;
  if (abs >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)} M`;
  if (abs >= 1_000) return `Rp ${(n / 1_000).toFixed(0)} K`;
  return `Rp ${NUMBER_FORMATTER.format(n)}`;
}

/**
 * Format a plain number with thousand separators (no currency).
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return NUMBER_FORMATTER.format(value);
}

/**
 * Format a ratio/percentage to 2 decimal places with a trailing "%".
 * Pass values already expressed as percent (e.g. 12.5 → "12.50%").
 */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

/**
 * Format a variance percentage with an explicit +/- sign, to 2 decimals.
 * @example formatVariancePercent(-8.4) // "-8.40%"
 */
export function formatVariancePercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Tailwind text-color class for a variance value: green when positive,
 * red when negative, muted when zero/undefined.
 */
export function varianceColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
    return "text-muted-foreground";
  }
  return value > 0 ? "text-variance-positive" : "text-variance-negative";
}

/**
 * Percentage variance of `actual` against `budget`, expressed as percent.
 * Returns null when budget is 0/undefined to avoid divide-by-zero.
 */
export function variancePercent(
  actual: number | null | undefined,
  budget: number | null | undefined,
): number | null {
  if (
    actual === null ||
    actual === undefined ||
    budget === null ||
    budget === undefined ||
    budget === 0
  ) {
    return null;
  }
  return ((actual - budget) / budget) * 100;
}
