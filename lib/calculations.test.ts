import { describe, it, expect } from "vitest";

import {
  variance,
  achievementPct,
  variancePct,
  revpar,
  adr,
  roas,
  ctr,
  cpc,
  avgCheck,
  momChange,
  ytdAccumulate,
} from "./calculations";

describe("variance", () => {
  it("returns actual minus budget", () => {
    expect(variance(80, 100)).toBe(-20);
    expect(variance(120, 100)).toBe(20);
    expect(variance(100, 100)).toBe(0);
  });
});

describe("achievementPct", () => {
  it("returns actual as a percentage of budget", () => {
    expect(achievementPct(78, 100)).toBe(78);
    expect(achievementPct(120, 100)).toBe(120);
  });
  it("returns null when budget is zero", () => {
    expect(achievementPct(50, 0)).toBeNull();
  });
});

describe("variancePct", () => {
  it("returns signed variance as a percentage of budget", () => {
    expect(variancePct(78, 100)).toBeCloseTo(-22, 10);
    expect(variancePct(110, 100)).toBeCloseTo(10, 10);
  });
  it("matches the real BKDS June room-revenue variance (~ -22.24%)", () => {
    // Actual 847,295,151 vs Budget 1,089,643,475
    expect(variancePct(847295151, 1089643475)).toBeCloseTo(-22.24, 2);
  });
  it("returns null when budget is zero", () => {
    expect(variancePct(50, 0)).toBeNull();
  });
});

describe("revpar", () => {
  it("divides room revenue by rooms available", () => {
    expect(revpar(540000, 540)).toBe(1000);
  });
  it("returns null when no rooms are available", () => {
    expect(revpar(540000, 0)).toBeNull();
  });
});

describe("adr", () => {
  it("divides room revenue by room nights", () => {
    // Matches the Market Segment ARR total of 1,866,288.88
    expect(adr(847295151, 454)).toBeCloseTo(1866288.88, 2);
  });
  it("returns null when there are no room nights", () => {
    expect(adr(1000, 0)).toBeNull();
  });
});

describe("roas", () => {
  it("returns tracked revenue over spend as a ratio", () => {
    // Real BKDS ads: revenue 92,402,552 / spend 947,324 ≈ 97.54
    expect(roas(92402552, 947324)).toBeCloseTo(97.54, 2);
  });
  it("returns null when spend is zero", () => {
    expect(roas(1000, 0)).toBeNull();
  });
});

describe("ctr", () => {
  it("returns clicks over impressions as a percentage", () => {
    expect(ctr(718, 17977)).toBeCloseTo(3.994, 3);
  });
  it("returns null when impressions are zero", () => {
    expect(ctr(10, 0)).toBeNull();
  });
});

describe("cpc", () => {
  it("returns spend over clicks", () => {
    expect(cpc(947324, 718)).toBeCloseTo(1319.39, 2);
  });
  it("returns null when there are no clicks", () => {
    expect(cpc(1000, 0)).toBeNull();
  });
});

describe("avgCheck", () => {
  it("returns revenue over covers", () => {
    expect(avgCheck(5000000, 20)).toBe(250000);
  });
  it("returns null when there are no covers", () => {
    expect(avgCheck(1000, 0)).toBeNull();
  });
});

describe("momChange", () => {
  it("returns the percentage change from previous to current", () => {
    expect(momChange(120, 100)).toBeCloseTo(20, 10);
    expect(momChange(80, 100)).toBeCloseTo(-20, 10);
  });
  it("returns null when the previous value is zero", () => {
    expect(momChange(100, 0)).toBeNull();
  });
});

describe("ytdAccumulate", () => {
  it("returns running cumulative totals", () => {
    expect(ytdAccumulate([10, 20, 30])).toEqual([10, 30, 60]);
  });
  it("handles an empty array", () => {
    expect(ytdAccumulate([])).toEqual([]);
  });
  it("accumulates the real BKDS monthly room nights to the YTD of 2612", () => {
    // Jan..Jun from the LOS sheet
    const result = ytdAccumulate([432, 374, 413, 446, 493, 454]);
    expect(result[result.length - 1]).toBe(2612);
  });
});
