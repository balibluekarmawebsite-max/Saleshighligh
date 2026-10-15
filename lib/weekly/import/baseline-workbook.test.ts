import { describe, expect, it } from "vitest";

import {
  type Cell,
  cleanBaselineRows,
  detectBaselineFromGrid,
  detectedRowsToPreview,
  monthToNumber,
} from "@/lib/weekly/import/baseline-workbook";

/**
 * Mirrors the real weekly-report workbook block (image: "B. YEAR TO DATE ACTUAL
 * & ON HAND FORECAST"): a title, a group header (OCCUPANCY / ARR / REVENUE), a
 * Budget / Last Year sub-header, month rows with Indonesian number formatting,
 * and an Average/Total row — with empty (merged-cell) gap columns throughout.
 */
const GRID: Cell[][] = [
  ["B. YEAR TO DATE ACTUAL & ON HAND FORECAST 2026"],
  ["As of 8th October"],
  [null, null, null, null, "OCCUPANCY", null, null, "ARR", null, null, "REVENUE", null],
  [null, "Month", null, null, "Budget", "Last Year", null, "Budget", "Last Year", null, "Budget", "Last Year"],
  [null, "January", null, null, "83,33%", "83,15%", null, "2.261.496", "2.119.971", null, "1.051.595.457", "983.666.566"],
  [null, "February", null, null, "75,00%", "68,25%", null, "1.949.050", "1.818.645", null, "736.740.808", "625.613.750"],
  [null, "March", null, null, "79,03%", "77,24%", null, "1.961.770", "1.790.646", null, "865.140.521", "771.768.308"],
  [null, "Average/Total", null, null, "85,66%", "74,97%", null, "2.153.260", "2.029.330", null, "12.118.549.267", "10.917.794.206"],
];

describe("monthToNumber", () => {
  it("reads names, abbreviations and numbers", () => {
    expect(monthToNumber("January")).toBe(1);
    expect(monthToNumber("jan")).toBe(1);
    expect(monthToNumber("DEC")).toBe(12);
    expect(monthToNumber(6)).toBe(6);
    expect(monthToNumber("Average/Total")).toBeNull();
    expect(monthToNumber("")).toBeNull();
  });
});

describe("detectBaselineFromGrid", () => {
  const rows = detectBaselineFromGrid(GRID);

  it("finds the 12-month table (here 3 months) and skips the total row", () => {
    expect(rows.map((r) => r.month)).toEqual([1, 2, 3]);
  });

  it("maps Budget/Last Year under Occupancy, ARR and Revenue and parses Indonesian numbers", () => {
    const jan = rows[0]!;
    expect(jan.budgetOcc).toBeCloseTo(83.33, 2); // "83,33%" → 83.33 (percent)
    expect(jan.lastyearOcc).toBeCloseTo(83.15, 2);
    expect(jan.budgetArr).toBe(2_261_496); // "2.261.496"
    expect(jan.lastyearArr).toBe(2_119_971);
    expect(jan.budgetRevenue).toBe(1_051_595_457);
    expect(jan.lastyearRevenue).toBe(983_666_566);
  });

  it("returns [] when there is no Budget/Last Year table", () => {
    expect(detectBaselineFromGrid([["Month", "RN", "Revenue"], ["January", "100", "5000"]])).toEqual([]);
  });

  it("reads ALL 12 months (no truncation), stopping at the total row", () => {
    const names = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const full: Cell[][] = [
      ["B. YEAR TO DATE ACTUAL & ON HAND FORECAST 2026"],
      [null, null, null, null, "OCCUPANCY", null, null, "ARR", null, null, "REVENUE", null],
      [null, "Month", null, null, "Budget", "Last Year", null, "Budget", "Last Year", null, "Budget", "Last Year"],
      ...names.map(
        (m, i): Cell[] => [null, m, null, null, `${80 + i},00%`, `${70 + i},00%`, null, `2.000.00${i}`, `1.900.00${i}`, null, `1.000.000.00${i}`, `900.000.00${i}`],
      ),
      [null, "Average/Total", null, null, "85,00%", "75,00%", null, "2.100.000", "2.000.000", null, "12.000.000.000", "11.000.000.000"],
    ];
    const all = detectBaselineFromGrid(full);
    expect(all).toHaveLength(12);
    expect(all.map((r) => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(all[11]!.budgetOcc).toBeCloseTo(91, 2); // December "91,00%"
    expect(all[11]!.lastyearOcc).toBeCloseTo(81, 2);
  });

  it("previews as string rows with the apply keys", () => {
    const preview = detectedRowsToPreview(rows);
    expect(preview[0]).toMatchObject({ month: "1", budgetOcc: "83.33", budgetArr: "2261496" });
  });
});

describe("cleanBaselineRows", () => {
  it("keeps one row per valid month (first wins) and drops junk", () => {
    const cleaned = cleanBaselineRows([
      { month: "1", budgetOcc: "80" },
      { month: "1", budgetOcc: "40" }, // duplicate month → dropped (first wins)
      { month: "January", lastyearOcc: "70" }, // name form, but month 1 already seen → dropped
      { month: "13" }, // out of range → dropped
      null, // not an object → dropped
      "nope", // not an object → dropped
      { month: "2", budgetArr: "100" },
    ]);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[0]).toMatchObject({ month: "1", budgetOcc: "80" });
    expect(cleaned[1]).toMatchObject({ month: "2", budgetArr: "100" });
  });

  it("caps at 12 rows", () => {
    const many = Array.from({ length: 24 }, (_, i) => ({ month: String((i % 12) + 1), budgetOcc: "50" }));
    expect(cleanBaselineRows(many)).toHaveLength(12);
  });

  it("always emits every field key as a string", () => {
    const [row] = cleanBaselineRows([{ month: 3, budgetArr: 2120000 }]);
    expect(row).toEqual({
      month: "3",
      budgetOcc: "",
      budgetArr: "2120000",
      budgetRevenue: "",
      lastyearOcc: "",
      lastyearArr: "",
      lastyearRevenue: "",
    });
  });
});
