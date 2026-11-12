import { describe, expect, it } from "vitest";

import { normalizeRankingPlatform, normalizeRankings } from "@/lib/sales/ota-ranking-logic";

describe("normalizeRankingPlatform", () => {
  it("maps common spellings to the enum", () => {
    expect(normalizeRankingPlatform("Booking.com")).toBe("BOOKING");
    expect(normalizeRankingPlatform("booking")).toBe("BOOKING");
    expect(normalizeRankingPlatform("Expedia")).toBe("EXPEDIA");
    expect(normalizeRankingPlatform("Trip Advisor")).toBe("TRIPADVISOR");
    expect(normalizeRankingPlatform("tripadvisor")).toBe("TRIPADVISOR");
    expect(normalizeRankingPlatform("agoda")).toBeNull();
  });
});

describe("normalizeRankings", () => {
  it("resolves platform, parses rank/total/rating, orders deterministically", () => {
    const r = normalizeRankings([
      { platform: "Tripadvisor", rank: "#3", total: "48", rating: "4.5" },
      { platform: "Booking.com", rank: 5, totalInMarket: "1,200", rating: 9.1 },
    ]);
    expect(r.rows.map((x) => x.platform)).toEqual(["BOOKING", "TRIPADVISOR"]);
    expect(r.rows[0]).toEqual({ platform: "BOOKING", rank: 5, totalInMarket: 1200, rating: 9.1 });
    expect(r.rows[1]).toEqual({ platform: "TRIPADVISOR", rank: 3, totalInMarket: 48, rating: 4.5 });
  });

  it("skips rows with an unknown platform or a non-positive rank, and reports skipped", () => {
    const r = normalizeRankings([
      { platform: "Agoda", rank: 2 },
      { platform: "Expedia", rank: 0 },
      { platform: "Booking", rank: 7 },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.platform).toBe("BOOKING");
    expect(r.skipped).toBe(2);
  });

  it("keeps the last row per platform (a correction wins) and nulls bad totals/ratings", () => {
    const r = normalizeRankings([
      { platform: "Booking", rank: 9, total: 0, rating: 99 },
      { platform: "Booking", rank: 4, total: -1, rating: 0 },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toEqual({ platform: "BOOKING", rank: 4, totalInMarket: null, rating: null });
  });
});
