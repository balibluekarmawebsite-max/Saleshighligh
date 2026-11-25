import { describe, expect, it } from "vitest";

import {
  buildSocialRow,
  parseSocialMetricMap,
  reduceMonthly,
  resolveSocialMetricNames,
  SOCIAL_NETWORKS,
} from "@/lib/sales/social-monthly-logic";

describe("resolveSocialMetricNames", () => {
  it("returns the built-in candidates in priority order", () => {
    expect(resolveSocialMetricNames("instagram", "impressions")).toEqual(["views", "impressions"]);
    expect(resolveSocialMetricNames("facebook", "profileVisits")).toEqual(["pageViews", "page_views", "page_views_total"]);
    expect(resolveSocialMetricNames("tiktok", "impressions")[0]).toBe("video_views");
    expect(resolveSocialMetricNames("youtube", "followersGained")).toEqual(["subscribers"]);
  });

  it("is case-insensitive on the network name", () => {
    expect(resolveSocialMetricNames("Instagram", "reach")).toEqual(["reach"]);
  });

  it("lets a string pin REPLACE the defaults", () => {
    const map = parseSocialMetricMap('{"instagram":{"impressions":"views"}}');
    expect(resolveSocialMetricNames("instagram", "impressions", map)).toEqual(["views"]);
  });

  it("lets an array pin set an explicit candidate list", () => {
    const map = parseSocialMetricMap('{"tiktok":{"interactions":["likes","shares"]}}');
    expect(resolveSocialMetricNames("tiktok", "interactions", map)).toEqual(["likes", "shares"]);
  });

  it("ignores a malformed override and falls back to defaults", () => {
    const map = parseSocialMetricMap("not json{");
    expect(resolveSocialMetricNames("instagram", "reach", map)).toEqual(["reach"]);
  });

  it("returns an empty list for an unknown network/metric", () => {
    expect(resolveSocialMetricNames("linkedin" as never, "reach")).toEqual([]);
  });
});

describe("reduceMonthly", () => {
  it("sums the month for a flow metric", () => {
    expect(reduceMonthly("flow", { sum: 252_000, first: 10, last: 20 })).toBe(252_000);
    expect(reduceMonthly("flow", { sum: null, first: 10, last: 20 })).toBeNull();
    expect(reduceMonthly("flow", { sum: 100.6, first: null, last: null })).toBe(101);
  });

  it("takes last − first for a net-gain metric (followers added this month)", () => {
    // 12,000 followers at month start → 12,458 at month end = +458 gained.
    expect(reduceMonthly("netgain", { sum: 999, first: 12_000, last: 12_458 })).toBe(458);
    // Net loss is allowed (negative).
    expect(reduceMonthly("netgain", { sum: 0, first: 500, last: 470 })).toBe(-30);
  });

  it("net-gain is null when an endpoint is missing (can't compute a delta)", () => {
    expect(reduceMonthly("netgain", { sum: 5, first: null, last: 12 })).toBeNull();
    expect(reduceMonthly("netgain", { sum: 5, first: 12, last: null })).toBeNull();
  });
});

describe("buildSocialRow", () => {
  it("builds the six-column row and lists every resolved metric", () => {
    const out = buildSocialRow({
      impressions: 252_000,
      reach: 99_800,
      interactions: 1_100,
      linkClicks: 3_300,
      profileVisits: 4_300,
      followersGained: 458,
    });
    expect(out).not.toBeNull();
    expect(out!.resolvedKeys).toEqual([
      "impressions",
      "reach",
      "interactions",
      "linkClicks",
      "profileVisits",
      "followersGained",
    ]);
    expect(out!.row).toEqual({
      impressions: 252_000,
      reach: 99_800,
      interactions: 1_100,
      linkClicks: 3_300,
      profileVisits: 4_300,
      followersGained: 458,
    });
  });

  it("marks ONLY the resolved metrics so a partial pull can't zero the rest on UPDATE", () => {
    // A common IG pull: only impressions + followers resolve, the rest come back empty.
    const out = buildSocialRow({ impressions: 1000, reach: null, followersGained: 20 });
    expect(out!.resolvedKeys).toEqual(["impressions", "followersGained"]);
    // row is CREATE-only (null → 0); resolvedKeys is what the caller UPDATEs.
    expect(out!.row.impressions).toBe(1000);
    expect(out!.row.reach).toBe(0);
    expect(out!.row.linkClicks).toBe(0);
    expect(out!.resolvedKeys).not.toContain("reach");
    expect(out!.resolvedKeys).not.toContain("linkClicks");
  });

  it("treats a net-gain of 0 as resolved (a real 'no followers gained' value)", () => {
    const out = buildSocialRow({ followersGained: 0 });
    expect(out!.resolvedKeys).toEqual(["followersGained"]);
    expect(out!.row.followersGained).toBe(0);
  });

  it("returns null when NOTHING resolved (no all-zero row written)", () => {
    expect(buildSocialRow({})).toBeNull();
    expect(buildSocialRow({ impressions: null, reach: null })).toBeNull();
  });
});

describe("SOCIAL_NETWORKS", () => {
  it("covers Instagram, Facebook, TikTok and YouTube with v2 api names", () => {
    expect(SOCIAL_NETWORKS.map((n) => n.apiName)).toEqual(["instagram", "facebook", "tiktok", "youtube"]);
    expect(SOCIAL_NETWORKS.map((n) => n.enumValue)).toEqual(["INSTAGRAM", "FACEBOOK", "TIKTOK", "YOUTUBE"]);
  });
});
