import { describe, expect, it } from "vitest";

import { coerceTripadvisorCore, tripadvisorHasData, toInt, toUsNum } from "@/lib/sales/tripadvisor-logic";

describe("coerceTripadvisorCore (the BKeto October Tripadvisor sample)", () => {
  const c = coerceTripadvisorCore({
    rating: "5.0",
    rank: 1,
    totalInMarket: 483,
    impressions: "7,090",
    impressionsMom: -9,
    pageVisitors: 493,
    pageVisitorsMom: -6,
    newReviews: 14,
    qrReviews: 0,
    photoViews: 700,
    photoViewsMom: 100,
    videoViews: 0,
    specialOfferClicks: 0,
    updateViews: 0,
    menuViews: 48,
    menuViewsMom: 7,
    phoneCalls: 0,
    phoneCallsMom: -100,
    websiteClicks: 7,
    websiteClicksMom: -50,
    mapViews: 10,
    mapViewsMom: 25,
  });

  it("parses the hero (rating clamped 0–5, rank + total)", () => {
    expect(c.avgRating).toBe(5);
    expect(c.rank).toBe(1);
    expect(c.totalInMarket).toBe(483);
  });

  it("parses counts with thousands separators", () => {
    expect(c.impressions).toBe(7090);
    expect(c.pageVisitors).toBe(493);
    expect(c.newReviews).toBe(14);
    expect(c.photoViews).toBe(700);
    expect(c.menuViews).toBe(48);
    expect(c.websiteClicks).toBe(7);
    expect(c.mapViews).toBe(10);
  });

  it("keeps the reported MoM signed (and null when absent)", () => {
    expect(c.impressionsMom).toBe(-9);
    expect(c.photoViewsMom).toBe(100);
    expect(c.phoneCallsMom).toBe(-100);
    expect(c.mapViewsMom).toBe(25);
    expect(c.videoViewsMom).toBeNull();
    expect(c.updateViewsMom).toBeNull();
  });

  it("accepts AI alias keys (listingImpressions / uniquePageVisitors / qrCodeReviews)", () => {
    const x = coerceTripadvisorCore({ listingImpressions: "7,090", uniquePageVisitors: 493, qrCodeReviews: 2, averageRating: 4.5 });
    expect(x.impressions).toBe(7090);
    expect(x.pageVisitors).toBe(493);
    expect(x.qrReviews).toBe(2);
    expect(x.avgRating).toBe(4.5);
  });

  it("defaults missing counts to 0, rank/total/MoM to null", () => {
    const x = coerceTripadvisorCore({ rating: 5 });
    expect(x.impressions).toBe(0);
    expect(x.menuViews).toBe(0);
    expect(x.rank).toBeNull();
    expect(x.totalInMarket).toBeNull();
    expect(x.impressionsMom).toBeNull();
  });

  it("clamps an out-of-range rating", () => {
    expect(coerceTripadvisorCore({ rating: 9 }).avgRating).toBe(5);
    expect(coerceTripadvisorCore({ rating: -2 }).avgRating).toBe(0);
  });

  it("tripadvisorHasData guards an empty save", () => {
    expect(tripadvisorHasData(c)).toBe(true);
    expect(tripadvisorHasData(coerceTripadvisorCore({}))).toBe(false);
    expect(tripadvisorHasData(coerceTripadvisorCore({ rating: 5 }))).toBe(true); // rating alone counts
    expect(tripadvisorHasData(coerceTripadvisorCore({ mapViews: 3 }))).toBe(true);
  });

  it("number helpers", () => {
    expect(toInt("7,090")).toBe(7090);
    expect(toInt("1,805")).toBe(1805);
    expect(toUsNum("5.0")).toBe(5);
    expect(toUsNum("-9%")).toBe(-9);
    expect(toUsNum("")).toBeNull();
  });
});
