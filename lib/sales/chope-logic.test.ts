import { describe, expect, it } from "vitest";

import {
  averagePartySize,
  coerceChopeCore,
  normalizeChopeDaily,
  toInt,
  toNum,
  toPct,
} from "@/lib/sales/chope-logic";

describe("number coercion", () => {
  it("parses counts, money and percentages", () => {
    expect(toInt("11")).toBe(11);
    expect(toNum("Rp 9,805,025")).toBe(9_805_025);
    expect(toNum("9.805.025")).toBe(9_805_025); // Indonesian thousands
    expect(toPct("5.73%")).toBeCloseTo(5.73, 5);
    expect(toPct("120%")).toBe(100); // clamp
    expect(toPct("")).toBeNull();
  });
});

describe("coerceChopeCore (the BKeto October sample)", () => {
  it("coerces the full funnel + revenue + sources", () => {
    const c = coerceChopeCore({
      fulfilledBookings: 11,
      fulfilledCovers: 39,
      cancelledBookings: 3,
      cancelledCovers: 18,
      noShowBookings: 1,
      noShowCovers: 2,
      upcomingBookings: 0,
      upcomingCovers: 0,
      walkinBookings: 0,
      walkinCovers: 0,
      revenue: "Rp 9,805,025",
      revenuePct: "5.73%",
      platformBookings: 7,
      platformCovers: 20,
      directBookings: 4,
      directCovers: 19,
    });
    expect(c.fulfilledBookings).toBe(11);
    expect(c.fulfilledCovers).toBe(39);
    expect(c.noShows).toBe(1);
    expect(c.noShowCovers).toBe(2);
    expect(c.revenue).toBe(9_805_025);
    expect(c.revenuePct).toBeCloseTo(5.73, 5);
    expect(c.platformBookings).toBe(7);
    expect(c.platformCovers).toBe(20);
    expect(c.directBookings).toBe(4);
    expect(c.directCovers).toBe(19);
  });

  it("defaults missing counts to 0 and an absent revenue % to null", () => {
    const c = coerceChopeCore({ fulfilledBookings: 5, fulfilledCovers: 10 });
    expect(c.fulfilledBookings).toBe(5);
    expect(c.cancelledBookings).toBe(0);
    expect(c.revenue).toBe(0);
    expect(c.revenuePct).toBeNull();
  });

  it("accepts AI alias keys (chopeGrabBookings / restaurantChannelCovers / percentage)", () => {
    const c = coerceChopeCore({
      chopeGrabBookings: 7,
      chopeGrabCovers: 20,
      restaurantChannelBookings: 4,
      restaurantChannelCovers: 19,
      percentage: 5.73,
    });
    expect(c.platformBookings).toBe(7);
    expect(c.platformCovers).toBe(20);
    expect(c.directBookings).toBe(4);
    expect(c.directCovers).toBe(19);
    expect(c.revenuePct).toBeCloseTo(5.73, 5);
  });

  it("clamps negatives and ignores junk input", () => {
    const c = coerceChopeCore("nope");
    expect(c.fulfilledBookings).toBe(0);
    expect(coerceChopeCore({ fulfilledBookings: -5 }).fulfilledBookings).toBe(0);
  });
});

describe("normalizeChopeDaily", () => {
  it("keeps days 1–31 with platform/direct, defaulting a missing count to 0", () => {
    const r = normalizeChopeDaily([
      { day: 11, platformBookings: 1, directBookings: 0 },
      { day: 20, platform: 0, direct: 1 }, // alias keys
      { day: 20, platformBookings: 1, directBookings: 1 }, // last wins
      { day: 0, platformBookings: 5 }, // out of range
      { day: 9 }, // no counts
    ] as never);
    expect(r.rows.map((x) => x.day)).toEqual([11, 20]);
    expect(r.rows[1]).toEqual({ day: 20, platformBookings: 1, directBookings: 1 });
    expect(r.skipped).toBe(2);
  });

  it("allows a day with only one source present", () => {
    const r = normalizeChopeDaily([{ day: 15, platformBookings: 2 }]);
    expect(r.rows[0]).toEqual({ day: 15, platformBookings: 2, directBookings: 0 });
  });
});

describe("averagePartySize", () => {
  it("is covers / bookings, null when no bookings", () => {
    expect(averagePartySize(39, 11)).toBeCloseTo(3.545, 3); // ~3.54 in the sample
    expect(averagePartySize(10, 0)).toBeNull();
  });
});
