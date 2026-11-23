import { describe, expect, it } from "vitest";

import {
  avgCheck,
  coerceSpaSegment,
  normalizeSpaPerf,
  spaPerfTotals,
  variancePct,
} from "@/lib/sales/spa-performance-logic";

describe("coerceSpaSegment", () => {
  it("maps free-form labels to the enum", () => {
    expect(coerceSpaSegment("Inhouse Guest")).toBe("IN_HOUSE");
    expect(coerceSpaSegment("In House")).toBe("IN_HOUSE");
    expect(coerceSpaSegment("Outside Guest")).toBe("OUTSIDE");
    expect(coerceSpaSegment("Outsider")).toBe("OUTSIDE");
    expect(coerceSpaSegment("Inclusion Guest")).toBe("INCLUSION");
    expect(coerceSpaSegment("IN_HOUSE")).toBe("IN_HOUSE");
    expect(coerceSpaSegment("Treatment")).toBeNull();
    expect(coerceSpaSegment(null)).toBeNull();
  });
});

describe("normalizeSpaPerf", () => {
  it("coerces Indonesian numbers, clamps negatives, orders by segment", () => {
    const rows = normalizeSpaPerf([
      { segment: "Outside Guest", coversActual: "58", coversBudget: "74", revenueActual: "54.461.736", revenueBudget: "34.123.169" },
      { segment: "Inhouse Guest", coversActual: "52", coversBudget: "161", revenueActual: "49.195.436", revenueBudget: "73.933.533" },
      { segment: "Inclusion Guest", coversActual: "56", coversBudget: "12", revenueActual: "11.425.620", revenueBudget: "5.687.195" },
    ]);
    expect(rows.map((r) => r.segment)).toEqual(["IN_HOUSE", "OUTSIDE", "INCLUSION"]);
    expect(rows[0]).toMatchObject({ coversActual: 52, coversBudget: 161, revenueActual: 49195436, revenueBudget: 73933533 });
    expect(rows[1]!.revenueActual).toBe(54461736);
  });

  it("keeps the last row per segment and drops empty / unknown segments", () => {
    const rows = normalizeSpaPerf([
      { segment: "In-House", coversActual: "10", revenueActual: "1000" },
      { segment: "In-House", coversActual: "52", coversBudget: "161", revenueActual: "49195436", revenueBudget: "73933533" },
      { segment: "Inclusion", coversActual: "0", coversBudget: "0", revenueActual: "0", revenueBudget: "0" }, // all-zero → dropped
      { segment: "Colonic", coversActual: "36" }, // unknown segment → dropped
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ segment: "IN_HOUSE", coversActual: 52, revenueActual: 49195436 });
  });

  it("ignores non-objects without throwing", () => {
    // @ts-expect-error — exercising defensive handling of bad input
    expect(normalizeSpaPerf([null, 5, "x", { segment: "Outside", coversActual: 3, revenueActual: 9 }])).toHaveLength(1);
  });
});

describe("avgCheck / variancePct / totals", () => {
  it("derives average check and guards divide-by-zero", () => {
    expect(avgCheck(49195436, 52)).toBeCloseTo(946066.08, 1);
    expect(avgCheck(100, 0)).toBeNull();
  });

  it("computes signed variance %", () => {
    expect(variancePct(52, 161)).toBeCloseTo(-67.7, 1);
    expect(variancePct(56, 12)).toBeCloseTo(366.67, 1);
    expect(variancePct(10, 0)).toBeNull();
  });

  it("sums column totals", () => {
    const rows = normalizeSpaPerf([
      { segment: "IN_HOUSE", coversActual: "52", coversBudget: "161", revenueActual: "49195436", revenueBudget: "73933533" },
      { segment: "OUTSIDE", coversActual: "58", coversBudget: "74", revenueActual: "54461736", revenueBudget: "34123169" },
      { segment: "INCLUSION", coversActual: "56", coversBudget: "12", revenueActual: "11425620", revenueBudget: "5687195" },
    ]);
    const t = spaPerfTotals(rows);
    expect(t.coversActual).toBe(166);
    expect(t.coversBudget).toBe(247);
    expect(t.revenueActual).toBe(115082792);
    expect(avgCheck(t.revenueActual, t.coversActual)).toBeCloseTo(693269.8, 0);
  });
});
