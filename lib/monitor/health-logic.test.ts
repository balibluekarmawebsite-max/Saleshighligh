import { describe, expect, it } from "vitest";

import {
  buildDailyRescrapeInput,
  classifyDailyFeed,
  diffNewGaps,
  gapKey,
  isGap,
  parseGapKey,
  relativeAge,
} from "@/lib/monitor/health-logic";

describe("classifyDailyFeed", () => {
  it("is ok when the last push is today (WITA)", () => {
    expect(classifyDailyFeed("2026-11-10", "2026-11-10")).toBe("ok");
  });

  it("is ok when a push is dated ahead of today (clock skew / backfill)", () => {
    expect(classifyDailyFeed("2026-11-11", "2026-11-10")).toBe("ok");
  });

  it("is stale when the last push was before today", () => {
    expect(classifyDailyFeed("2026-11-09", "2026-11-10")).toBe("stale");
  });

  it("is missing when nothing has ever pushed", () => {
    expect(classifyDailyFeed(null, "2026-11-10")).toBe("missing");
  });

  it("is pending (not a gap) before the morning cutoff when nothing arrived yet", () => {
    // expectedArrived=false → too early to call a no-show a failure.
    expect(classifyDailyFeed(null, "2026-11-10", false)).toBe("pending");
    expect(classifyDailyFeed("2026-11-09", "2026-11-10", false)).toBe("pending");
  });

  it("is still ok before the cutoff once today's push has landed", () => {
    expect(classifyDailyFeed("2026-11-10", "2026-11-10", false)).toBe("ok");
  });

  it("treats stale and missing as gaps; ok and pending are not", () => {
    expect(isGap(classifyDailyFeed(null, "2026-11-10"))).toBe(true);
    expect(isGap(classifyDailyFeed("2026-11-09", "2026-11-10"))).toBe(true);
    expect(isGap(classifyDailyFeed("2026-11-10", "2026-11-10"))).toBe(false);
    expect(isGap(classifyDailyFeed(null, "2026-11-10", false))).toBe(false);
  });
});

describe("gapKey / parseGapKey", () => {
  it("builds a stable upper-cased key and round-trips", () => {
    const k = gapKey("bkds", "occupancy", "2026-11-10");
    expect(k).toBe("BKDS:occupancy:2026-11-10");
    expect(parseGapKey(k)).toEqual({ property: "BKDS", feed: "occupancy", date: "2026-11-10" });
  });

  it("returns null for a malformed key", () => {
    expect(parseGapKey("nope")).toBeNull();
    expect(parseGapKey("BKDS::2026-11-10")).toBeNull();
  });
});

describe("diffNewGaps", () => {
  it("returns only gaps not present in the prior run", () => {
    const current = ["BKDS:occupancy:2026-11-10", "BKDU:reservation:2026-11-10"];
    const prior = ["BKDS:occupancy:2026-11-10"];
    expect(diffNewGaps(current, prior)).toEqual(["BKDU:reservation:2026-11-10"]);
  });

  it("treats every gap as new when there is no prior run", () => {
    const current = ["BKDS:occupancy:2026-11-10"];
    expect(diffNewGaps(current, [])).toEqual(current);
  });

  it("returns nothing when all current gaps were already open", () => {
    const current = ["BKDS:occupancy:2026-11-10"];
    expect(diffNewGaps(current, ["BKDS:occupancy:2026-11-10", "BKDU:reservation:2026-11-10"])).toEqual([]);
  });
});

describe("buildDailyRescrapeInput", () => {
  it("makes a one-day section-D job (start == end, upper-cased property)", () => {
    expect(buildDailyRescrapeInput("bkdu", "2026-11-10")).toEqual({
      property: "BKDU",
      section: "D",
      start: "2026-11-10",
      end: "2026-11-10",
    });
  });
});

describe("relativeAge", () => {
  const now = Date.UTC(2026, 10, 10, 12, 0, 0);
  it("labels common ranges", () => {
    expect(relativeAge(null, now)).toBe("never");
    expect(relativeAge(now - 30_000, now)).toBe("just now");
    expect(relativeAge(now - 5 * 60_000, now)).toBe("5m ago");
    expect(relativeAge(now - 3 * 3_600_000, now)).toBe("3h ago");
    expect(relativeAge(now - 2 * 86_400_000, now)).toBe("2d ago");
  });
  it("clamps a future timestamp to just now", () => {
    expect(relativeAge(now + 60_000, now)).toBe("just now");
  });
});
