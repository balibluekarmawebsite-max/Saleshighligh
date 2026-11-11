import { describe, expect, it } from "vitest";

import { expandToRows, normalizeExtraction } from "@/lib/sales/market-segment-logic";

describe("normalizeExtraction", () => {
  it("reads ty_/bud_/ly_ flat keys and computes ARR when missing", () => {
    const segs = normalizeExtraction({
      segments: [
        { segment: "OTA", ty_rn: 289, ty_rev: 552709343, bud_rn: 300, bud_arr: 1900000, bud_rev: 570000000 },
      ],
    });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.segmentName).toBe("OTA");
    expect(segs[0]!.actual.rn).toBe(289);
    expect(Math.round(segs[0]!.actual.arr)).toBe(Math.round(552709343 / 289)); // ARR derived
    expect(segs[0]!.budget.arr).toBe(1900000);
    expect(segs[0]!.lastYear).toBeNull();
  });

  it("accepts a bare array and nested objects, and keeps last year when present", () => {
    const segs = normalizeExtraction([
      { name: "Corporate", actual: { rn: 10, revenue: 20_000_000 }, lastYear: { rn: 8, revenue: 15_000_000 } },
    ]);
    expect(segs[0]!.segmentName).toBe("Corporate");
    expect(segs[0]!.lastYear?.rn).toBe(8);
  });

  it("drops rows with no name or no figures, and coerces string numbers", () => {
    const segs = normalizeExtraction({
      segments: [
        { segment: "", ty_rn: 5 },
        { segment: "Empty", ty_rn: 0, ty_rev: 0 },
        { segment: "Direct", ty_rn: "1,200", ty_rev: "3 400 000" },
      ],
    });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.segmentName).toBe("Direct");
    expect(segs[0]!.actual.rn).toBe(1200);
    expect(segs[0]!.actual.revenue).toBe(3_400_000);
  });

  it("dedupes a repeated segment name (last wins) to protect the unique key", () => {
    const segs = normalizeExtraction({
      segments: [
        { segment: "OTA", ty_rn: 100, ty_rev: 1_000_000 },
        { segment: "ota", ty_rn: 289, ty_rev: 552_709_343 },
      ],
    });
    expect(segs).toHaveLength(1);
    expect(segs[0]!.actual.rn).toBe(289);
  });
});

describe("expandToRows", () => {
  it("emits a row per series that has data, tagged with scope", () => {
    const rows = expandToRows(
      [
        {
          segmentName: "OTA",
          actual: { rn: 289, arr: 1_900_000, revenue: 552_000_000 },
          budget: { rn: 300, arr: 1_950_000, revenue: 585_000_000 },
          lastYear: null,
        },
      ],
      "MTD",
    );
    expect(rows).toHaveLength(2); // ACTUAL + BUDGET (no last year)
    expect(rows.every((r) => r.scope === "MTD" && r.segmentName === "OTA")).toBe(true);
    expect(rows.map((r) => r.series).sort()).toEqual(["ACTUAL", "BUDGET"]);
  });
});
