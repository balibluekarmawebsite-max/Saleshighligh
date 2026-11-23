import { describe, expect, it } from "vitest";

import {
  dateToStatMonth,
  marketAreaHasData,
  normalizeMarketAreaRows,
  parseStatMonth,
  statMonthToDate,
} from "@/lib/sales/market-area-logic";

describe("parseStatMonth", () => {
  it("parses ISO, slash, named and m/yyyy forms", () => {
    expect(parseStatMonth("2026-10")).toBe("2026-10");
    expect(parseStatMonth("2026/4")).toBe("2026-04");
    expect(parseStatMonth("Oct 2026")).toBe("2026-10");
    expect(parseStatMonth("October 2026")).toBe("2026-10");
    expect(parseStatMonth("10/2026")).toBe("2026-10");
  });
  it("rejects nonsense and out-of-range months", () => {
    expect(parseStatMonth("")).toBeNull();
    expect(parseStatMonth("2026-13")).toBeNull();
    expect(parseStatMonth("hello")).toBeNull();
  });
});

describe("statMonthToDate / dateToStatMonth round-trip", () => {
  it("round-trips a month key", () => {
    const d = statMonthToDate("2026-10");
    expect(d).not.toBeNull();
    expect(dateToStatMonth(d!)).toBe("2026-10");
  });
  it("rejects a malformed key", () => {
    expect(statMonthToDate("2026-1")).toBeNull();
  });
});

describe("normalizeMarketAreaRows", () => {
  it("keeps rows with data, defaults metrics, sorts ascending, dedupes by month", () => {
    const out = normalizeMarketAreaRows([
      { month: "Oct 2026", propertyRoomNights: "310", marketRoomNights: "83", propertyAdr: "3700000", marketAdr: "2300000" },
      { month: "Sep 2026", propertyRoomNights: "240", marketRoomNights: "82", propertyAdr: "3200000", marketAdr: "2250000" },
      // duplicate month — last wins
      { month: "2026-10", propertyRoomNights: "311", marketRoomNights: "", propertyAdr: "", marketAdr: "" },
    ]);
    expect(out.map((r) => r.month)).toEqual(["2026-09", "2026-10"]);
    expect(out[1]).toEqual({ month: "2026-10", propertyRoomNights: 311, marketRoomNights: 0, propertyAdr: 0, marketAdr: 0 });
  });

  it("drops rows with no valid month or no data", () => {
    const out = normalizeMarketAreaRows([
      { month: "", propertyRoomNights: "100" },
      { month: "2026-07", propertyRoomNights: "0", marketRoomNights: "0", propertyAdr: "0", marketAdr: "0" },
      { month: "nope", propertyRoomNights: "5" },
    ]);
    expect(out).toEqual([]);
    expect(marketAreaHasData(out)).toBe(false);
  });

  it("parses Indonesian-formatted ADR", () => {
    const out = normalizeMarketAreaRows([
      { month: "2026-06", propertyRoomNights: "545", marketRoomNights: "85", propertyAdr: "4.000.000", marketAdr: "2.300.000" },
    ]);
    expect(out[0]?.propertyAdr).toBe(4000000);
    expect(out[0]?.marketAdr).toBe(2300000);
  });
});
