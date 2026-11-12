/**
 * Derive the "Restaurant Sales Performance" table from the raw per-meal figures
 * (covers + revenue, actual vs budget). Every other number — average check, the
 * mix/deviation %, the Difference columns and the TOTAL row — is COMPUTED here,
 * so the only stored inputs are covers and revenue. Pure + testable; the display
 * component and the preview both render from this.
 *
 * Column meanings per the sample deck:
 *  - Cover / Revenue  %: share of the total (mix); TOTAL = 100%.
 *  - Average Check    %: deviation from the blended average check; TOTAL = 100%.
 *  - Different: Actual − Budget.  Different %: (Actual − Budget) / Budget.
 */

import type { MealRow } from "@/lib/dashboard-data";

export interface SalesCell {
  actual: number;
  actualPct: number; // mix share, or avg-check deviation from blended
  budget: number;
  budgetPct: number;
  diff: number; // actual − budget
  diffPct: number | null; // (actual − budget) / budget
}

export interface SalesMealBlock {
  meal: string; // BREAKFAST | LUNCH | DINNER | TOTAL
  cover: SalesCell;
  avgCheck: SalesCell;
  revenue: SalesCell;
}

export interface SalesTable {
  meals: SalesMealBlock[];
  total: SalesMealBlock;
}

const share = (part: number, whole: number): number => (whole !== 0 ? (part / whole) * 100 : 0);
const varPct = (actual: number, budget: number): number | null =>
  budget !== 0 ? ((actual - budget) / budget) * 100 : null;
const avg = (revenue: number, covers: number): number => (covers !== 0 ? revenue / covers : 0);

function cell(actual: number, actualPct: number, budget: number, budgetPct: number): SalesCell {
  return { actual, actualPct, budget, budgetPct, diff: actual - budget, diffPct: varPct(actual, budget) };
}

/** Build the full Restaurant Sales table (meal blocks + TOTAL) from the meals. */
export function buildSalesTable(meals: MealRow[]): SalesTable {
  const totCoversA = meals.reduce((s, m) => s + m.coversActual, 0);
  const totCoversB = meals.reduce((s, m) => s + m.coversBudget, 0);
  const totRevA = meals.reduce((s, m) => s + m.revenueActual, 0);
  const totRevB = meals.reduce((s, m) => s + m.revenueBudget, 0);
  const totAvgA = avg(totRevA, totCoversA);
  const totAvgB = avg(totRevB, totCoversB);

  const blocks: SalesMealBlock[] = meals.map((m) => {
    const avgA = avg(m.revenueActual, m.coversActual);
    const avgB = avg(m.revenueBudget, m.coversBudget);
    return {
      meal: m.meal,
      cover: cell(m.coversActual, share(m.coversActual, totCoversA), m.coversBudget, share(m.coversBudget, totCoversB)),
      // Average-check % is the deviation from the blended average check.
      avgCheck: cell(avgA, share(avgA - totAvgA, totAvgA), avgB, share(avgB - totAvgB, totAvgB)),
      revenue: cell(m.revenueActual, share(m.revenueActual, totRevA), m.revenueBudget, share(m.revenueBudget, totRevB)),
    };
  });

  // TOTAL row: cover/revenue are the whole (100%); average check shows 100% too,
  // matching the sample (the blended figure is the reference).
  const total: SalesMealBlock = {
    meal: "TOTAL",
    cover: cell(totCoversA, 100, totCoversB, 100),
    avgCheck: cell(totAvgA, 100, totAvgB, 100),
    revenue: cell(totRevA, 100, totRevB, 100),
  };

  return { meals: blocks, total };
}
