import { describe, expect, it } from "vitest";

import { occFractionToPct, occPctToFraction } from "@/lib/weekly/annual-budget";

/**
 * The fixed annual "Last Year" baseline (WeeklyLastYear) reuses the budget's
 * occupancy converters and the same unit boundary: the Budget & Last Year page
 * enters a percent, WeeklyLastYear stores a percent, and the dashboard / export
 * / Section B grid read a 0–1 fraction (the same unit the old per-week Last Year
 * figures used). This guards that round-trip at typical prior-year values.
 */
describe("annual last-year occupancy conversion", () => {
  it("round-trips a page-entered percent through storage and back", () => {
    for (const pct of [78, 80, 81, 84, 85, 72.5, 66.7]) {
      const fraction = occPctToFraction(pct); // what the baseline save stores as the LY fraction
      const stored = occFractionToPct(fraction); // what saveAnnualLastYear writes to WeeklyLastYear.occupancy
      const back = occPctToFraction(stored); // what getAnnualLastYear returns
      expect(stored).toBeCloseTo(pct, 3);
      expect(back).toBeCloseTo(fraction, 4);
    }
  });

  it("treats a cleared month as blank, not zero", () => {
    // A stored 0 means "unset" for both budget and last year — the module maps
    // it back to null so Section B shows a blank cell, never a misleading 0%.
    expect(occPctToFraction(0)).toBe(0);
  });
});
