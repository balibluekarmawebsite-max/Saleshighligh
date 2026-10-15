import { describe, expect, it } from "vitest";

import { BASELINE_IMPORT_COLUMNS, baselineCsvTemplate, parseBaselineRows } from "@/lib/weekly/import";

/**
 * The Budget & Last Year upload (year-scoped) reuses the shared column parser.
 * Percent columns are returned RAW here (e.g. 84, not 0.84) — the ÷100 to a
 * fraction happens on apply (applyBaselineRows → saveAnnual*).
 */
describe("Budget & Last Year upload parsing", () => {
  it("parses a valid month row with budget + last year", () => {
    const res = parseBaselineRows([
      {
        month: 1,
        budget_occ_pct: 84,
        budget_arr: 2_050_000,
        budget_revenue: 965_000_000,
        lastyear_occ_pct: 78,
        lastyear_arr: 1_890_000,
        lastyear_revenue: 840_000_000,
      },
    ]);
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(1);
    const r = res.rows[0]!;
    expect(r.month).toBe(1);
    expect(r.budgetOcc).toBe(84); // raw percent; ÷100 happens on apply
    expect(r.lastyearRevenue).toBe(840_000_000);
  });

  it("flags a missing month and an out-of-range occupancy", () => {
    const res = parseBaselineRows([
      { month: "", budget_occ_pct: 50 },
      { month: 2, budget_occ_pct: 150 },
    ]);
    expect(res.ok).toBe(false);
    expect(res.issues).toHaveLength(2);
  });

  it("skips fully blank lines and strips thousand separators", () => {
    const res = parseBaselineRows([
      { month: 3, budget_arr: "2,120,000" },
      { month: "", budget_occ_pct: "", budget_arr: "" },
    ]);
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]!.budgetArr).toBe(2_120_000);
  });

  it("template has all headers and a row per month (1–12)", () => {
    const lines = baselineCsvTemplate().trim().split("\n");
    expect(lines[0]).toBe(BASELINE_IMPORT_COLUMNS.map((c) => c.header).join(","));
    expect(lines).toHaveLength(13); // header + 12 months
  });
});
