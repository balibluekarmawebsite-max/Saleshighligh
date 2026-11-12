import { describe, expect, it } from "vitest";

import type { MealRow } from "@/lib/dashboard-data";
import { buildSalesTable } from "@/lib/sales/restaurant-sales-table";

// The October BKeto sample from the deck (raw inputs only).
const SAMPLE: MealRow[] = [
  { meal: "BREAKFAST", coversActual: 892, coversBudget: 860, revenueActual: 137_350_206, revenueBudget: 150_568_274, avgCheckActual: null, avgCheckBudget: null, pctOfRevenue: 0 },
  { meal: "LUNCH", coversActual: 431, coversBudget: 669, revenueActual: 169_475_890, revenueBudget: 95_443_325, avgCheckActual: null, avgCheckBudget: null, pctOfRevenue: 0 },
  { meal: "DINNER", coversActual: 426, coversBudget: 717, revenueActual: 134_016_088, revenueBudget: 234_596_112, avgCheckActual: null, avgCheckBudget: null, pctOfRevenue: 0 },
];

const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps;

describe("buildSalesTable (reproduces the deck's computed columns)", () => {
  const t = buildSalesTable(SAMPLE);
  const bf = t.meals[0]!;
  const lunch = t.meals[1]!;

  it("totals match the deck", () => {
    expect(t.total.cover.actual).toBe(1749);
    expect(t.total.cover.budget).toBe(2246);
    expect(t.total.revenue.actual).toBe(440_842_184);
    expect(t.total.revenue.budget).toBe(480_607_711);
    expect(Math.round(t.total.avgCheck.actual)).toBe(252_054);
    expect(Math.round(t.total.avgCheck.budget)).toBe(213_984);
  });

  it("cover/revenue % are mix share; TOTAL diff % match", () => {
    expect(near(bf.cover.actualPct, 51.0)).toBe(true);
    expect(near(bf.cover.budgetPct, 38.29)).toBe(true);
    expect(near(bf.revenue.actualPct, 31.16)).toBe(true);
    expect(near(t.total.cover.diffPct!, -22.1, 0.1)).toBe(true);
    expect(near(t.total.revenue.diffPct!, -8.3, 0.1)).toBe(true);
  });

  it("average check is revenue/covers and its % is deviation from the blended", () => {
    expect(Math.round(bf.avgCheck.actual)).toBe(153_980);
    expect(Math.round(bf.avgCheck.budget)).toBe(175_079);
    expect(near(bf.avgCheck.actualPct, -38.91, 0.1)).toBe(true); // below blended
    expect(near(lunch.avgCheck.actualPct, 56.0, 0.1)).toBe(true); // above blended
    expect(near(t.total.avgCheck.diffPct!, 17.8, 0.1)).toBe(true);
  });

  it("Different is actual − budget", () => {
    expect(bf.cover.diff).toBe(32);
    expect(bf.revenue.diff).toBe(137_350_206 - 150_568_274);
  });
});
