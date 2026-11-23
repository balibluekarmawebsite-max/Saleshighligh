import { describe, expect, it } from "vitest";

import {
  normalizeTreatmentRows,
  treatmentAvgCheck,
  treatmentPct,
  treatmentTotals,
} from "@/lib/sales/spa-treatments-logic";

describe("normalizeTreatmentRows", () => {
  it("parses Indonesian numbers, drops TOTAL/blank, de-dupes by name", () => {
    const { rows, skipped } = normalizeTreatmentRows([
      { treatmentName: "Balinese Massage", count: "30", revenue: "24.000.000" },
      { treatmentName: "Buccal Face Massage", count: "14", revenue: "11.900.000" },
      { treatmentName: "TOTAL", count: "166", revenue: "115.082.791" }, // derived → dropped
      { treatmentName: "", count: "5", revenue: "1" }, // no name → dropped
      { treatmentName: "Balinese Massage", count: "31", revenue: "24800000" }, // correction wins
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ treatmentName: "Balinese Massage", count: 31, revenue: 24800000 });
    expect(rows[1]).toMatchObject({ treatmentName: "Buccal Face Massage", count: 14, revenue: 11900000 });
    expect(skipped).toBe(2);
  });

  it("clamps negatives and skips rows missing count or revenue", () => {
    const { rows } = normalizeTreatmentRows([
      { treatmentName: "A", count: "-5", revenue: "-100" },
      { treatmentName: "B", count: "3" }, // no revenue → skipped
    ]);
    expect(rows).toEqual([{ treatmentName: "A", count: 0, revenue: 0 }]);
  });

  it("ignores non-objects without throwing", () => {
    // @ts-expect-error — defensive handling of bad input
    expect(normalizeTreatmentRows([null, 7, { treatmentName: "X", count: 2, revenue: 9 }]).rows).toHaveLength(1);
  });
});

describe("treatment derivations", () => {
  const rows = normalizeTreatmentRows([
    { treatmentName: "Balinese Massage", count: "30", revenue: "24000000" },
    { treatmentName: "Spa Inclusion", count: "56", revenue: "11425620" },
  ]).rows;

  it("totals, average check and share", () => {
    const t = treatmentTotals(rows);
    expect(t.count).toBe(86);
    expect(t.revenue).toBe(35425620);
    expect(t.avgCheck).toBeCloseTo(411925.8, 0);
    expect(treatmentAvgCheck(rows[0]!)).toBe(800000);
    expect(treatmentPct(rows[0]!, t.count)).toBeCloseTo(34.88, 1);
    expect(treatmentAvgCheck({ count: 0, revenue: 100 })).toBeNull();
    expect(treatmentPct({ count: 5 }, 0)).toBe(0);
  });
});
