import { describe, expect, it } from "vitest";

import {
  canonicalMetric,
  normalizeSojernMeta,
  normalizeSojernPoints,
  parseMonth,
  parseYear,
  sojernHasData,
  toSignedPct,
} from "@/lib/sales/sojern-logic";

describe("canonicalMetric / parseMonth / parseYear", () => {
  it("maps metrics", () => {
    expect(canonicalMetric("Flight")).toBe("FLIGHT");
    expect(canonicalMetric("hotels")).toBe("HOTEL");
    expect(canonicalMetric("car")).toBeNull();
  });
  it("parses months from int and name", () => {
    expect(parseMonth(3)).toBe(3);
    expect(parseMonth("Jan")).toBe(1);
    expect(parseMonth("december")).toBe(12);
    expect(parseMonth("13")).toBeNull();
  });
  it("validates years", () => {
    expect(parseYear("2026")).toBe(2026);
    expect(parseYear("1999")).toBeNull();
  });
});

describe("toSignedPct", () => {
  it("keeps 0 and negatives, nulls blanks", () => {
    expect(toSignedPct("0")).toBe(0);
    expect(toSignedPct("-22")).toBe(-22);
    expect(toSignedPct("")).toBeNull();
    expect(toSignedPct(null)).toBeNull();
  });
});

describe("normalizeSojernMeta", () => {
  it("fills sensible defaults", () => {
    expect(normalizeSojernMeta({ destination: "Indonesia, Bali" })).toEqual({
      destination: "Indonesia, Bali",
      originCountry: "(All)",
      eventType: "Booking",
      timePeriod: "Monthly",
      baselineLabel: "Jan 2023",
    });
  });
});

describe("normalizeSojernPoints", () => {
  it("keeps valid points (incl. 0), dedupes, sorts, drops invalid", () => {
    const out = normalizeSojernPoints([
      { metric: "Hotel", year: "2026", month: "Jan", value: "-20" },
      { metric: "Flight", year: "2023", month: "Jan", value: "0" },
      { metric: "Flight", year: "2023", month: 1, value: "0.5" }, // dup, last wins
      { metric: "car", year: "2026", month: "Jan", value: "5" }, // invalid metric
      { metric: "Flight", year: "2026", month: "Dec", value: "" }, // no value
    ]);
    expect(out.map((p) => `${p.metric}-${p.year}-${p.month}`)).toEqual(["FLIGHT-2023-1", "HOTEL-2026-1"]);
    expect(out[0]?.valuePct).toBe(0.5);
    expect(sojernHasData(out)).toBe(true);
  });

  it("reports no data on an empty set", () => {
    expect(sojernHasData(normalizeSojernPoints([]))).toBe(false);
  });
});
