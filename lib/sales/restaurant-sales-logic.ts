/**
 * Pure normalisation for the Restaurant Sales Performance upload. Turns raw
 * rows (from an AI extraction or a manual form) into the per-meal covers +
 * revenue (actual & budget) that FnbSales stores. Average check and every %/
 * Difference column are derived elsewhere, so only these four numbers matter.
 */

import { normalizeNumber } from "@/lib/import/number";

export const MEAL_PERIODS = ["BREAKFAST", "LUNCH", "DINNER"] as const;
export type MealPeriod = (typeof MEAL_PERIODS)[number];

export const MEAL_PERIOD_LABEL: Record<MealPeriod, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

/** Coerce a whole number using the project's Indonesian/US-aware parser, so
 * "137.350.206", "1.749" and "137.350.206,00" all read correctly (not inflated
 * by stripping the decimal comma), then round to an integer (covers / whole IDR). */
export const toInt = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : Math.round(n);
};

/** Map a free-text meal name to the enum, else null (TOTAL/blank is dropped). */
export function normalizeMeal(input: unknown): MealPeriod | null {
  const s = String(input ?? "").toLowerCase();
  if (s.includes("break")) return "BREAKFAST";
  if (s.includes("lunch")) return "LUNCH";
  if (s.includes("dinner") || s.includes("din")) return "DINNER";
  return null;
}

export interface RawMealRow {
  meal?: unknown;
  mealPeriod?: unknown;
  coversActual?: unknown;
  coversBudget?: unknown;
  revenueActual?: unknown;
  revenueBudget?: unknown;
}

export interface NormalMealRow {
  mealPeriod: MealPeriod;
  coversActual: number;
  /** null = the source carried no budget (leave an existing one untouched). */
  coversBudget: number | null;
  revenueActual: number;
  revenueBudget: number | null;
}

export interface MealNormalizeResult {
  rows: NormalMealRow[];
  skipped: number;
}

/** Normalise meal rows: resolve the meal, parse covers + revenue, drop unknown
 * meals / TOTAL / empty rows, keep the last row per meal (a correction wins),
 * and return them in BREAKFAST→DINNER order. */
export function normalizeMealRows(raw: RawMealRow[]): MealNormalizeResult {
  const byMeal = new Map<MealPeriod, NormalMealRow>();
  let skipped = 0;

  for (const r of raw ?? []) {
    if (r == null || typeof r !== "object") {
      skipped += 1;
      continue;
    }
    const meal = normalizeMeal(r.mealPeriod ?? r.meal);
    const coversActual = toInt(r.coversActual);
    const coversBudget = toInt(r.coversBudget);
    const revenueActual = toInt(r.revenueActual);
    const revenueBudget = toInt(r.revenueBudget);
    // Need a meal and at least actual covers + actual revenue to be useful.
    if (!meal || coversActual == null || revenueActual == null) {
      skipped += 1;
      continue;
    }
    byMeal.set(meal, {
      mealPeriod: meal,
      coversActual: Math.max(0, coversActual),
      // null (not 0) when no budget was supplied, so a re-upload of actuals
      // alone doesn't wipe a budget already stored from the workbook import.
      coversBudget: coversBudget == null ? null : Math.max(0, coversBudget),
      revenueActual: Math.max(0, revenueActual),
      revenueBudget: revenueBudget == null ? null : Math.max(0, revenueBudget),
    });
  }

  const rows = MEAL_PERIODS.map((m) => byMeal.get(m)).filter((r): r is NormalMealRow => !!r);
  return { rows, skipped };
}
