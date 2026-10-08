import { afterEach, describe, expect, it } from "vitest";

import {
  metricKind,
  readAggregate,
  readLast,
  readV2Timeline,
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

describe("readV2Timeline (nested per-account series, string values)", () => {
  it("sums and takes last from the nested {data:[{metric,values:[{dateTime,value}]}]} shape", () => {
    const resp = {
      data: [
        {
          metric: "pageViews",
          values: [
            { dateTime: "2026-09-01T12:00:00+0200", value: "100" },
            { dateTime: "2026-09-02T12:00:00+0200", value: "250" },
            { dateTime: "2026-09-03T12:00:00+0200", value: 400 },
          ],
        },
      ],
    };
    expect(readV2Timeline(resp)).toEqual({ sum: 750, last: 400 });
  });

  it("picks the matching series by metric name when several are returned", () => {
    const resp = {
      data: [
        { metric: "reach", values: [{ dateTime: "d1", value: 5 }] },
        { metric: "impressions", values: [{ dateTime: "d1", value: 9 }, { dateTime: "d2", value: 11 }] },
      ],
    };
    expect(readV2Timeline(resp, "impressions")).toEqual({ sum: 20, last: 11 });
    expect(readV2Timeline(resp, "reach")).toEqual({ sum: 5, last: 5 });
  });

  it("handles a flat [[ts,val]] series and empty/odd shapes", () => {
    expect(readV2Timeline({ data: [["1767243600000", "3"], ["1767330000000", "4"]] })).toEqual({ sum: 7, last: 4 });
    expect(readV2Timeline({ data: [] })).toEqual({ sum: null, last: null });
    expect(readV2Timeline(null)).toEqual({ sum: null, last: null });
    expect(readV2Timeline({ data: [{ metric: "x", values: [] }] })).toEqual({ sum: null, last: null });
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

  it("defaults followers to the v1 timeline and flow metrics to the v2 timelines endpoint", () => {
    expect(resolveMetricSource("instagram", "ig", "followers")).toEqual({ source: "timeline", name: "igFollowers" });
    expect(resolveMetricSource("facebook", "fb", "followers")).toEqual({ source: "timeline", name: "fbFollowers" });
    expect(resolveMetricSource("instagram", "ig", "account_reached")).toEqual({
      source: "v2timeline",
      metric: "reach",
      subject: "account",
      reduce: "sum",
    });
    // Facebook defaults use the page-level names observed on the account.
    expect(resolveMetricSource("facebook", "fb", "impression")).toEqual({
      source: "v2timeline",
      metric: "page_media_view",
      subject: "account",
      reduce: "sum",
    });
    expect(resolveMetricSource("facebook", "fb", "profile_visit")?.metric).toBe("pageViews");
  });

  it("merges an object env override (metric + subject) without flipping the endpoint", () => {
    process.env.METRICOOL_METRIC_MAP = JSON.stringify({
      instagram: { impression: { metric: "views", subject: "account" } },
    });
    expect(resolveMetricSource("instagram", "ig", "impression")).toEqual({
      source: "v2timeline",
      metric: "views",
      subject: "account",
      reduce: "sum",
    });
    // other metrics unaffected
    expect(resolveMetricSource("instagram", "ig", "account_reached")?.metric).toBe("reach");
  });

  it("lets an override name a different source (e.g. back to v2 aggregation)", () => {
    process.env.METRICOOL_METRIC_MAP = JSON.stringify({
      instagram: { impression: { source: "v2agg", metric: "views", subject: "posts" } },
    });
    expect(resolveMetricSource("instagram", "ig", "impression")).toEqual({
      source: "v2agg",
      metric: "views",
      subject: "posts",
    });
  });

  it("accepts a string override as the metric name (endpoint unchanged)", () => {
    process.env.METRICOOL_METRIC_MAP = JSON.stringify({ facebook: { impression: "pageViews" } });
    const s = resolveMetricSource("facebook", "fb", "impression");
    expect(s?.source).toBe("v2timeline");
    expect(s?.metric).toBe("pageViews");
    expect(s?.reduce).toBe("sum");
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
