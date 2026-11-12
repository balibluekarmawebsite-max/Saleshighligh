import { describe, expect, it } from "vitest";

import {
  normalizeSourceRows,
  sourceAvgCheck,
  sourcePctPersons,
  sourceTotals,
  toInt,
  toNum,
} from "@/lib/sales/restaurant-sources-logic";

// The BKeto October "Source of Booking" sample.
const SAMPLE = [
  { sourceName: "Breakfast in House", persons: "844", revenue: "131.285.021" },
  { sourceName: "Dinner in House", persons: "144", revenue: "60.540.824" },
  { sourceName: "Breakfast Outsider", persons: "48", revenue: "6.065.185" },
  { sourceName: "Dinner Outsider", persons: "276", revenue: "63.670.240" },
  { sourceName: "Lunch in House", persons: "154", revenue: "77.819.182" },
  { sourceName: "Lunch Outsider", persons: "257", revenue: "89.101.406" },
  { sourceName: "Chopee", persons: "20", revenue: "9.805.025" },
  { sourceName: "Grab & Gojek", persons: "6", revenue: "2.555.302" },
];

describe("toInt / toNum", () => {
  it("parses Indonesian thousands without inflating on a decimal comma", () => {
    expect(toInt("1.749")).toBe(1749);
    expect(toNum("131.285.021")).toBe(131_285_021);
    expect(toNum("131.285.021,00")).toBe(131_285_021); // decimal comma, not ~100x
    expect(toInt("844")).toBe(844);
    expect(toNum("")).toBeNull();
  });
});

describe("normalizeSourceRows", () => {
  it("parses the sample rows and keeps every source", () => {
    const r = normalizeSourceRows(SAMPLE);
    expect(r.rows).toHaveLength(8);
    expect(r.skipped).toBe(0);
    expect(r.rows[0]).toEqual({ sourceName: "Breakfast in House", persons: 844, revenue: 131_285_021 });
    expect(r.rows[7]).toEqual({ sourceName: "Grab & Gojek", persons: 6, revenue: 2_555_302 });
  });

  it("drops a TOTAL row and rows missing a name / persons / revenue", () => {
    const r = normalizeSourceRows([
      { sourceName: "Chopee", persons: 20, revenue: 9_805_025 },
      { sourceName: "TOTAL", persons: 1749, revenue: 440_842_184 },
      { sourceName: "Grand Total", persons: 1749, revenue: 440_842_184 },
      { sourceName: "", persons: 5, revenue: 10 },
      { sourceName: "Lunch Outsider", persons: 257 }, // no revenue
      null as never,
    ]);
    expect(r.rows.map((x) => x.sourceName)).toEqual(["Chopee"]);
    expect(r.skipped).toBe(5);
  });

  it("keeps the last row per source name (a correction wins, case-insensitive)", () => {
    const r = normalizeSourceRows([
      { sourceName: "Chopee", persons: 20, revenue: 9_000_000 },
      { sourceName: "chopee", persons: 22, revenue: 9_805_025 },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({ sourceName: "chopee", persons: 22, revenue: 9_805_025 });
  });

  it("clamps negatives to zero", () => {
    const r = normalizeSourceRows([{ sourceName: "Odd", persons: -5, revenue: -100 }]);
    expect(r.rows[0]).toEqual({ sourceName: "Odd", persons: 0, revenue: 0 });
  });
});

describe("derived columns reproduce the sample deck", () => {
  const rows = normalizeSourceRows(SAMPLE).rows;
  const totals = sourceTotals(rows);

  it("totals persons and revenue and the blended average check", () => {
    expect(totals.persons).toBe(1749);
    // The deck prints 440.842.184 for TOTAL, but that is off-by-one from its own
    // per-row rounding; the true sum of the printed rows is 440,842,185.
    expect(totals.revenue).toBe(440_842_185);
    expect(Math.round(totals.avgCheck!)).toBe(252_054); // deck TOTAL average check
  });

  it("per-row average check matches the deck (revenue / persons)", () => {
    expect(Math.round(sourceAvgCheck(rows[0]!)!)).toBe(155_551); // Breakfast in House
    expect(Math.round(sourceAvgCheck(rows[1]!)!)).toBe(420_422); // Dinner in House
    expect(sourceAvgCheck({ persons: 0, revenue: 10 })).toBeNull();
  });

  it("per-row % share of persons matches the deck", () => {
    expect(sourcePctPersons(rows[0]!, totals.persons).toFixed(2)).toBe("48.26"); // 844 / 1749
    expect(sourcePctPersons(rows[7]!, totals.persons).toFixed(2)).toBe("0.34"); // 6 / 1749
    expect(sourcePctPersons({ persons: 5 }, 0)).toBe(0);
  });
});
