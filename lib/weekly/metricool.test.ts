import { afterEach, describe, expect, it } from "vitest";

import {
  metricKind,
  readAggregate,
  readLast,
  resolveMetricSource,
  sourceLabel,
  toTzIso,
  toYmd,
} from "./metricool";

describe("toYmd", () => {
  it("formats a UTC date as YYYYMMDD", () => {
    expect(toYmd(new Date("2026-02-05T00:00:00.000Z"))).toBe("20260205");
    expect(toYmd(new Date("2026-12-31T23:59:59.000Z"))).toBe("20261231");
  });
});

describe("toTzIso", () => {
  it("builds a start/end ISO datetime in the Metricool timezone", () => {
    expect(toTzIso(new Date("2026-10-02T00:00:00.000Z"), false)).toBe("2026-10-02T00:00:00+08:00");
    expect(toTzIso(new Date("2026-10-08T00:00:00.000Z"), true)).toBe("2026-10-08T23:59:59+08:00");
  });
});

describe("readAggregate (tolerant)", () => {
  it("reads a bare number", () => {
    expect(readAggregate(509)).toBe(509);
    expect(readAggregate(0)).toBe(0);
  });
  it("unwraps the v2 {data:N} envelope, including string values", () => {
    expect(readAggregate({ data: 2.9045 })).toBeCloseTo(2.9045);
    expect(readAggregate({ data: "816810" })).toBe(816810);
    expect(readAggregate({ data: { total: 11 } })).toBe(11);
  });
  it("reads common object envelopes", () => {
    expect(readAggregate({ total: 985 })).toBe(985);
    expect(readAggregate({ value: 42 })).toBe(42);
    expect(readAggregate({ sum: 7 })).toBe(7);
  });
  it("sums a values array or a point array", () => {
    expect(readAggregate({ values: [{ value: 2 }, { value: 3 }, { value: 5 }] })).toBe(10);
    expect(readAggregate([["20260201", 4], ["20260202", 6]])).toBe(10);
    expect(readAggregate([1, 2, 3])).toBe(6);
  });
  it("returns null for shapes with no number", () => {
    expect(readAggregate(null)).toBeNull();
    expect(readAggregate({})).toBeNull();
    expect(readAggregate({ data: null })).toBeNull();
    expect(readAggregate("nope")).toBeNull();
    expect(readAggregate({ values: [] })).toBeNull();
  });
});

describe("readLast (tolerant timeline, string values + epoch timestamps)", () => {
  it("takes the last value from Metricool's [[epoch,\"value\"],…] series", () => {
    expect(readLast([["1767243600000", "1357.0"], ["1767330000000", "1361.0"]])).toBe(1361);
    expect(readLast([["20261008", "0"]])).toBe(0);
    expect(readLast({ values: [{ value: 1 }, { value: 2 }] })).toBe(2);
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

describe("metricKind", () => {
  it("classifies followers as stock and the rest as flow", () => {
    expect(metricKind("followers")).toBe("stock");
    expect(metricKind("account_reached")).toBe("flow");
    expect(metricKind("impression")).toBe("flow");
  });
});

describe("resolveMetricSource", () => {
  afterEach(() => {
    delete process.env.METRICOOL_METRIC_MAP;
  });

  it("defaults followers to the v1 timeline and flow metrics to v2 aggregation", () => {
    expect(resolveMetricSource("instagram", "ig", "followers")).toEqual({ source: "timeline", name: "igFollowers" });
    expect(resolveMetricSource("facebook", "fb", "followers")).toEqual({ source: "timeline", name: "fbFollowers" });
    expect(resolveMetricSource("instagram", "ig", "account_reached")).toEqual({
      source: "v2agg",
      metric: "reach",
      subject: "account",
    });
  });

  it("merges an object env override (metric + subject) over the default", () => {
    process.env.METRICOOL_METRIC_MAP = JSON.stringify({
      instagram: { impression: { metric: "views", subject: "account" } },
    });
    expect(resolveMetricSource("instagram", "ig", "impression")).toEqual({
      source: "v2agg",
      metric: "views",
      subject: "account",
    });
    // other metrics unaffected
    expect(resolveMetricSource("instagram", "ig", "account_reached")?.metric).toBe("reach");
  });

  it("accepts a string override as the v2 metric name", () => {
    process.env.METRICOOL_METRIC_MAP = JSON.stringify({ facebook: { impression: "pageViews" } });
    const s = resolveMetricSource("facebook", "fb", "impression");
    expect(s?.source).toBe("v2agg");
    expect(s?.metric).toBe("pageViews");
  });

  it("returns null for an unknown metric key", () => {
    expect(resolveMetricSource("instagram", "ig", "nope")).toBeNull();
  });
});

describe("sourceLabel", () => {
  it("labels timeline and v2 sources", () => {
    expect(sourceLabel({ source: "timeline", name: "igFollowers" })).toBe("igFollowers (timeline)");
    expect(sourceLabel({ source: "v2agg", metric: "reach", subject: "account" })).toBe("reach@account (v2)");
    expect(sourceLabel(null)).toBeNull();
  });
});
