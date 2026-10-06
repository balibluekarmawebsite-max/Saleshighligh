import { describe, expect, it } from "vitest";

import {
  channelYtd,
  delta,
  growth,
  growthPercent,
  headlineMonth,
  monthlyTotals,
  occPercent,
  productionTotals,
  rate,
  sharePercent,
  variance,
  variancePercent,
} from "./calculations";

describe("rate (ARR / ADR)", () => {
  it("divides revenue by room nights", () => {
    expect(rate(1_000_000, 4)).toBe(250_000);
  });
  it("returns null on zero or missing room nights", () => {
    expect(rate(1_000_000, 0)).toBeNull();
    expect(rate(1_000_000, null)).toBeNull();
    expect(rate(null, 4)).toBeNull();
  });
});

describe("sharePercent", () => {
  it("returns a whole percent", () => {
    expect(sharePercent(25, 200)).toBe(12.5);
  });
  it("returns null on zero total", () => {
    expect(sharePercent(25, 0)).toBeNull();
  });
});

describe("occPercent", () => {
  it("converts a 0–1 fraction to a whole percent", () => {
    expect(occPercent(0.9483)).toBeCloseTo(94.83, 5);
  });
  it("passes null through", () => {
    expect(occPercent(null)).toBeNull();
  });
});

describe("variance", () => {
  it("computes signed percent and direction vs a positive compare", () => {
    expect(variance(78, 100)).toEqual({ pct: -22, direction: "down" });
    expect(variance(120, 100)).toEqual({ pct: 20, direction: "up" });
  });
  it("uses |compare| in the denominator so the sign tracks actual − compare", () => {
    expect(variance(-50, -100).pct).toBe(50); // (-50 - -100)/100 = +50
  });
  it("is flat within ±0.05% and null on zero/missing compare", () => {
    expect(variance(100, 100)).toEqual({ pct: 0, direction: "flat" });
    expect(variance(78, 0)).toEqual({ pct: null, direction: "flat" });
    expect(variance(null, 100)).toEqual({ pct: null, direction: "flat" });
  });
  it("variancePercent returns just the percent", () => {
    expect(variancePercent(78, 100)).toBe(-22);
    expect(variancePercent(78, 0)).toBeNull();
  });
});

describe("productionTotals", () => {
  it("sums room nights and revenue and blends ARR", () => {
    const rows = [
      { rnSold: 10, grossRevenue: 5_000_000 },
      { rnSold: 30, grossRevenue: 15_000_000 },
    ];
    expect(productionTotals(rows)).toEqual({
      rn: 40,
      revenue: 20_000_000,
      arr: 500_000,
    });
  });
  it("treats null fields as zero and yields null ARR when no room nights", () => {
    expect(productionTotals([{ rnSold: null, grossRevenue: 1_000 }])).toEqual({
      rn: 0,
      revenue: 1_000,
      arr: null,
    });
  });
});

describe("monthlyTotals", () => {
  it("sums revenue columns and blends ARR on summed room nights", () => {
    const rows = [
      { rnSold: 100, revActual: 300_000_000, revBudget: 320_000_000, revLy: 280_000_000 },
      { rnSold: 100, revActual: 200_000_000, revBudget: 180_000_000, revLy: 220_000_000 },
    ];
    const t = monthlyTotals(rows);
    expect(t.rnSold).toBe(200);
    expect(t.revActual).toBe(500_000_000);
    expect(t.arrActual).toBe(2_500_000);
    expect(t.arrBudget).toBe(2_500_000);
    expect(t.arrLy).toBe(2_500_000);
  });
});

describe("channelYtd", () => {
  it("sums the 12 month columns, treating null as zero", () => {
    expect(channelYtd([5, 10, null, 15, undefined, 0, 0, 0, 0, 0, 0, 0])).toBe(30);
  });
});

describe("social growth", () => {
  it("growth is this − last", () => {
    expect(growth(100, 140)).toBe(40);
    expect(growth(null, 140)).toBeNull();
  });
  it("growthPercent is relative to last week", () => {
    expect(growthPercent(100, 140)).toBe(40);
    expect(growthPercent(0, 140)).toBeNull();
  });
});

describe("delta (week over week)", () => {
  it("computes abs, pct and direction", () => {
    expect(delta(110, 100)).toEqual({ abs: 10, pct: 10, direction: "up" });
    expect(delta(90, 100)).toEqual({ abs: -10, pct: -10, direction: "down" });
    expect(delta(100, 100)).toEqual({ abs: 0, pct: 0, direction: "flat" });
  });
  it("returns nulls when a side is missing", () => {
    expect(delta(null, 100)).toEqual({ abs: null, pct: null, direction: "flat" });
  });
});

describe("headlineMonth", () => {
  const months = [
    { month: 9, hasFigures: true },
    { month: 10, hasFigures: true },
    { month: 11, hasFigures: false },
  ];
  it("prefers the end-date month when it has figures", () => {
    expect(headlineMonth(10, months)).toBe(10);
  });
  it("falls back to the latest month with figures", () => {
    expect(headlineMonth(11, months)).toBe(10);
  });
  it("returns null when nothing has figures", () => {
    expect(headlineMonth(10, [{ month: 10, hasFigures: false }])).toBeNull();
  });
});
