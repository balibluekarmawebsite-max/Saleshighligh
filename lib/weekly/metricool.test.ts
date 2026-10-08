import { afterEach, describe, expect, it } from "vitest";

import {
  candidateMetricNames,
  metricKind,
  readAggregate,
  readLast,
  toYmd,
} from "./metricool";

describe("toYmd", () => {
  it("formats a UTC date as YYYYMMDD", () => {
    expect(toYmd(new Date("2026-02-05T00:00:00.000Z"))).toBe("20260205");
    expect(toYmd(new Date("2026-12-31T23:59:59.000Z"))).toBe("20261231");
  });
});

describe("readAggregate (tolerant)", () => {
  it("reads a bare number", () => {
    expect(readAggregate(509)).toBe(509);
    expect(readAggregate(0)).toBe(0);
  });
  it("reads common object envelopes", () => {
    expect(readAggregate({ total: 985 })).toBe(985);
    expect(readAggregate({ value: 42 })).toBe(42);
    expect(readAggregate({ sum: 7 })).toBe(7);
    expect(readAggregate({ data: { total: 11 } })).toBe(11);
  });
  it("sums a values array or a point array", () => {
    expect(readAggregate({ values: [{ value: 2 }, { value: 3 }, { value: 5 }] })).toBe(10);
    expect(readAggregate([["20260201", 4], ["20260202", 6]])).toBe(10);
    expect(readAggregate([1, 2, 3])).toBe(6);
  });
  it("returns null for shapes with no number", () => {
    expect(readAggregate(null)).toBeNull();
    expect(readAggregate({})).toBeNull();
    expect(readAggregate("nope")).toBeNull();
    expect(readAggregate({ values: [] })).toBeNull();
  });
});

describe("readLast (tolerant timeline)", () => {
  it("takes the last non-null point value", () => {
    expect(readLast([["20260201", 100], ["20260202", 110], ["20260203", 125]])).toBe(125);
    expect(readLast({ values: [{ value: 1 }, { value: 2 }] })).toBe(2);
    expect(readLast({ data: [{ date: "x", value: 9 }] })).toBe(9);
  });
  it("skips trailing nulls to the last real value", () => {
    expect(readLast([["a", 7], ["b", null]])).toBe(7);
  });
  it("falls back to a single value, else null", () => {
    expect(readLast(55)).toBe(55);
    expect(readLast({ total: 3 })).toBe(3);
    expect(readLast([])).toBeNull();
  });
});

describe("candidateMetricNames", () => {
  afterEach(() => {
    delete process.env.METRICOOL_METRIC_MAP;
  });

  it("builds network-prefixed candidates with generic fallbacks", () => {
    const ig = candidateMetricNames("Instagram", "ig", "account_reached");
    expect(ig[0]).toBe("igReach");
    expect(ig).toContain("reach");
    const fb = candidateMetricNames("Facebook", "fb", "impression");
    expect(fb[0]).toBe("fbImpressions");
    expect(fb).toContain("views");
  });

  it("classifies followers as a stock metric and the rest as flow", () => {
    expect(metricKind("followers")).toBe("stock");
    expect(metricKind("account_reached")).toBe("flow");
    expect(metricKind("impression")).toBe("flow");
  });

  it("honours an env override as the sole candidate", () => {
    process.env.METRICOOL_METRIC_MAP = JSON.stringify({ instagram: { impression: "igViews" } });
    expect(candidateMetricNames("Instagram", "ig", "impression")).toEqual(["igViews"]);
    // Other metrics are unaffected by the override.
    expect(candidateMetricNames("Instagram", "ig", "account_reached")[0]).toBe("igReach");
  });

  it("returns [] for an unknown metric key", () => {
    expect(candidateMetricNames("Instagram", "ig", "nope")).toEqual([]);
  });
});
