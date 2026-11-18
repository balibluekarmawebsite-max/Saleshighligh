import { describe, expect, it } from "vitest";

import { coerceGokaiCore, gokaiHasData, normalizeGokaiUnit } from "@/lib/sales/gokai-logic";

describe("coerceGokaiCore (the GOKAI Production October sample)", () => {
  const c = coerceGokaiCore({
    signups: 293,
    openRatePct: "40.816%",
    ctrPct: "21.245%",
    surveyCompletionPct: "6.78%",
    upsellSales: 0,
    upsellRevenue: "IDR 0",
    signupsMom: 8.519,
    openRateMom: -34.664,
    ctrMom: -6.228,
    surveyMom: -24.068,
    upsellSalesMom: -400,
    upsellRevenueMom: -349_800_000,
  });

  it("reads the six metrics with rates stored as ratios", () => {
    expect(c.signups).toBe(293);
    expect(c.openRatePct).toBeCloseTo(0.40816, 6);
    expect(c.ctrPct).toBeCloseTo(0.21245, 6);
    expect(c.surveyCompletionPct).toBeCloseTo(0.0678, 6);
    expect(c.upsellSales).toBe(0);
    expect(c.upsellRevenue).toBe(0);
  });

  it("keeps the signed reported MoM (no clamp, large values allowed)", () => {
    expect(c.signupsMom).toBeCloseTo(8.519, 4);
    expect(c.openRateMom).toBeCloseTo(-34.664, 4);
    expect(c.upsellSalesMom).toBe(-400);
    expect(c.upsellRevenueMom).toBe(-349_800_000);
  });

  it("defaults missing metrics to 0 and a missing MoM to null", () => {
    const x = coerceGokaiCore({ signups: 10 });
    expect(x.signups).toBe(10);
    expect(x.upsellRevenue).toBe(0);
    expect(x.openRatePct).toBe(0);
    expect(x.signupsMom).toBeNull();
    expect(x.productViews).toBe(0);
  });

  it("accepts AI alias keys (guestsAdded / guestJourneyOpenRate / upsellTransactions)", () => {
    const x = coerceGokaiCore({ guestsAdded: 293, guestJourneyOpenRate: "40.8%", upsellTransactions: 4 });
    expect(x.signups).toBe(293);
    expect(x.openRatePct).toBeCloseTo(0.408, 4);
    expect(x.upsellSales).toBe(4);
  });

  it("gokaiHasData / normalizeGokaiUnit", () => {
    expect(gokaiHasData(c)).toBe(true);
    expect(gokaiHasData(coerceGokaiCore({}))).toBe(false);
    expect(gokaiHasData(coerceGokaiCore({ upsellRevenue: 0, upsellSales: 0 }))).toBe(false);
    expect(normalizeGokaiUnit("hotel")).toBe("HOTEL");
    expect(normalizeGokaiUnit("spa")).toBe("SPA");
    expect(normalizeGokaiUnit("junk")).toBe("RESTAURANT");
  });
});
