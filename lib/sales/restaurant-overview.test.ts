import { describe, expect, it } from "vitest";

import {
  bulletsFromText,
  coerceOverview,
  isOverviewEmpty,
  parseOverview,
  serializeOverview,
} from "@/lib/sales/restaurant-overview";

describe("restaurant overview parse/serialize", () => {
  it("round-trips the four sections through JSON", () => {
    const data = {
      challenges: ["Revenue below budget", "Covers down 12% vs Sep"],
      highlights: ["Lunch average check +48%"],
      marketing: ["Drive festive dining"],
      takeaway: "Rebuild dinner traffic while holding average check.",
    };
    const parsed = parseOverview(serializeOverview(data));
    expect(parsed).toEqual(data);
  });

  it("returns empty sections for blank/null content", () => {
    expect(isOverviewEmpty(parseOverview(null))).toBe(true);
    expect(isOverviewEmpty(parseOverview("   "))).toBe(true);
  });

  it("preserves legacy free-text content in the takeaway", () => {
    const parsed = parseOverview("😊 Good: strong lunch\n☹️ weak dinner");
    expect(parsed.challenges).toEqual([]);
    expect(parsed.takeaway).toContain("strong lunch");
  });

  it("drops bullet markers and blank lines when parsing a textarea", () => {
    expect(bulletsFromText("- one\n• two\n\n  * three  ")).toEqual(["one", "two", "three"]);
  });

  it("keeps a leading minus attached to a figure (does not read it as a bullet)", () => {
    expect(bulletsFromText("-12% covers vs September")).toEqual(["-12% covers vs September"]);
    expect(bulletsFromText("-Rp 50M dinner shortfall")).toEqual(["-Rp 50M dinner shortfall"]);
    expect(bulletsFromText("-8.40% revenue vs budget")).toEqual(["-8.40% revenue vs budget"]);
    // a dash + space is still a bullet marker
    expect(bulletsFromText("- 3 pts occupancy lost")).toEqual(["3 pts occupancy lost"]);
  });

  it("coerces a stored string field into bullets (defensive)", () => {
    const parsed = parseOverview(JSON.stringify({ challenges: "- a\n- b", takeaway: "t" }));
    expect(parsed.challenges).toEqual(["a", "b"]);
    expect(parsed.takeaway).toBe("t");
  });
});

describe("coerceOverview (AI extraction / upload)", () => {
  it("coerces the canonical array+string shape", () => {
    const data = coerceOverview({
      challenges: ["Revenue below budget", "Dinner covers down"],
      highlights: ["Lunch average check up"],
      marketing: ["Festive dining push"],
      takeaway: "Rebuild dinner while holding average check.",
    });
    expect(data.challenges).toEqual(["Revenue below budget", "Dinner covers down"]);
    expect(data.highlights).toEqual(["Lunch average check up"]);
    expect(data.marketing).toEqual(["Festive dining push"]);
    expect(data.takeaway).toBe("Rebuild dinner while holding average check.");
  });

  it("joins an array takeaway into one paragraph", () => {
    const data = coerceOverview({ takeaway: ["Strong lunch.", "Weak dinner."] });
    expect(data.takeaway).toBe("Strong lunch. Weak dinner.");
  });

  it("accepts alias keys (keyChallenges / positiveHighlights / marketingFocus / keyTakeaway)", () => {
    const data = coerceOverview({
      keyChallenges: ["c"],
      positiveHighlights: ["h"],
      marketingFocus: ["m"],
      keyTakeaway: "t",
    });
    expect(data).toEqual({ challenges: ["c"], highlights: ["h"], marketing: ["m"], takeaway: "t" });
  });

  it("tolerates a string bullet-section and preserves a leading-minus figure", () => {
    const data = coerceOverview({ challenges: "-12% covers vs September\nRevenue below budget" });
    expect(data.challenges).toEqual(["-12% covers vs September", "Revenue below budget"]);
  });

  it("returns an empty overview for junk / non-object input", () => {
    expect(isOverviewEmpty(coerceOverview(null))).toBe(true);
    expect(isOverviewEmpty(coerceOverview("nope"))).toBe(true);
    expect(isOverviewEmpty(coerceOverview([1, 2, 3]))).toBe(true);
    expect(isOverviewEmpty(coerceOverview({ foo: "bar" }))).toBe(true);
  });
});
