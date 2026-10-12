import { describe, expect, it } from "vitest";

import { occFractionToPct, occPctToFraction } from "@/lib/weekly/annual-budget";

/**
 * Occupancy unit handling for the fixed annual budget. The grid enters a
 * percent, WeeklyBudget stores a percent, and the dashboard/export read a
 * 0–1 fraction (same unit the old per-week budget used) — these converters sit
 * on that boundary, so the round-trip must be exact at the common values.
 */
describe("annual budget occupancy conversion", () => {
  it("percent → fraction", () => {
    expect(occPctToFraction(84)).toBe(0.84);
    expect(occPctToFraction(72.5)).toBe(0.725);
    expect(occPctToFraction(0)).toBe(0);
    expect(occPctToFraction(100)).toBe(1);
  });

  it("fraction → percent", () => {
    expect(occFractionToPct(0.84)).toBe(84);
    expect(occFractionToPct(0.725)).toBe(72.5);
    expect(occFractionToPct(1)).toBe(100);
  });

  it("round-trips a grid-entered percent through storage and back", () => {
    for (const pct of [77, 81, 84, 88, 90, 72.5, 66.7]) {
      const fraction = occPctToFraction(pct); // what editor-actions stores as the budget fraction
      const stored = occFractionToPct(fraction); // what saveAnnualBudget writes to WeeklyBudget.occupancy
      const back = occPctToFraction(stored); // what getAnnualBudget returns
      expect(stored).toBeCloseTo(pct, 3);
      expect(back).toBeCloseTo(fraction, 4);
    }
  });
});
