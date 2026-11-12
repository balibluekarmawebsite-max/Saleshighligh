/**
 * Pure normalisation for the Restaurant Sales Performance upload. Turns raw
 * rows (from an AI extraction or a manual form) into the per-meal covers +
 * revenue (actual & budget) that FnbSales stores. Average check and every %/
 * Difference column are derived elsewhere, so only these four numbers matter.
 */

export const MEAL_PERIODS = ["BREAKFAST", "LUNCH", "DINNER"] as const;
export type MealPeriod = (typeof MEAL_PERIODS)[number];

export const MEAL_PERIOD_LABEL: Record<MealPeriod, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  DINNER: "Dinner",
};

/** Coerce an integer, stripping thousand separators ("137.350.206", "1,749")
 * and any stray characters. No real decimals are expected (whole IDR / counts). */
export const toInt = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  const s = String(v ?? "").replace(/[^\d]/g, "");
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
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
  coversBudget: number;
  revenueActual: number;
  revenueBudget: number;
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
      coversBudget: Math.max(0, coversBudget ?? 0),
      revenueActual: Math.max(0, revenueActual),
      revenueBudget: Math.max(0, revenueBudget ?? 0),
    });
  }

  const rows = MEAL_PERIODS.map((m) => byMeal.get(m)).filter((r): r is NormalMealRow => !!r);
  return { rows, skipped };
}
