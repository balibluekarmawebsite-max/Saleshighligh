import { describe, expect, it } from "vitest";

import {
  bookingOverviewHasData,
  coerceBookingOverviewCore,
  normalizeAvailRows,
} from "@/lib/sales/booking-overview-logic";

describe("coerceBookingOverviewCore", () => {
  it("parses the funnel, conversions, availability and vs-market", () => {
    const c = coerceBookingOverviewCore({
      window: "Last 90 days",
      dataAsOf: "Oct 23, 2026",
      searchResultsViews: "745,335",
      searchResultsViewsVsMkt: "1,140.86",
      propertyPageVisits: "19,098",
      propertyPageVisitsVsMkt: "857.42",
      bookingsMade: "327",
      bookingsMadeVsMkt: "975.29",
      searchToPagePct: "2.56",
      searchToPageMarketPct: "3.32",
      searchToPageVsMkt: "-22.84",
      pageToBookingPct: "1.71",
      pageToBookingMarketPct: "1.52",
      pageToBookingVsMkt: "12.31",
      availabilityPct: "68.64",
      availabilityVsMkt: "79.48",
    });
    expect(c.searchResultsViews).toBe(745335);
    expect(c.searchResultsViewsVsMkt).toBe(1140.86);
    expect(c.searchToPagePct).toBe(2.56);
    expect(c.searchToPageVsMkt).toBe(-22.84);
    expect(c.availabilityPct).toBe(68.64);
    expect(c.dataAsOf).toBe("2026-10-23");
    expect(bookingOverviewHasData(c)).toBe(true);
  });

  it("defaults window, clamps percents, keeps nulls for absent vs-market", () => {
    const c = coerceBookingOverviewCore({ searchToPagePct: "250", availabilityVsMkt: "" });
    expect(c.windowLabel).toBe("Last 90 days");
    expect(c.searchToPagePct).toBe(100); // clamped
    expect(c.availabilityVsMkt).toBeNull();
    expect(c.searchResultsViewsVsMkt).toBeNull();
    expect(bookingOverviewHasData(c)).toBe(true); // conversion > 0
  });

  it("reports no data on an empty object", () => {
    expect(bookingOverviewHasData(coerceBookingOverviewCore({}))).toBe(false);
  });
});

describe("normalizeAvailRows", () => {
  it("keeps months with data, dedupes, sorts ascending", () => {
    const out = normalizeAvailRows([
      { month: "Oct 2026", yourPct: "76", marketPct: "40" },
      { month: "Jul 2026", yourPct: "65", marketPct: "37" },
      { month: "2026-07", yourPct: "66", marketPct: "" }, // dup month, last wins
      { month: "bad", yourPct: "10" },
      { month: "2026-09", yourPct: "0", marketPct: "0" }, // no data -> dropped
    ]);
    expect(out.map((r) => r.month)).toEqual(["2026-07", "2026-10"]);
    expect(out[0]).toEqual({ month: "2026-07", yourPct: 66, marketPct: 0 });
  });
});
