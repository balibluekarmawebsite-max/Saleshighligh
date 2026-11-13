import { describe, expect, it } from "vitest";

import {
  channelLabel,
  channelSortKey,
  normalizeChannelRows,
  normalizeDailyRows,
  parsePctToRatio,
  toInt,
} from "@/lib/sales/restaurant-acquisition-logic";

describe("parsePctToRatio", () => {
  it("reads percentages into a 0–1 ratio, clamped", () => {
    expect(parsePctToRatio("64.6%")).toBeCloseTo(0.646, 5);
    expect(parsePctToRatio("64,6%")).toBeCloseTo(0.646, 5); // Indonesian comma
    expect(parsePctToRatio("64.6")).toBeCloseTo(0.646, 5); // bare percent
    expect(parsePctToRatio("3.6%")).toBeCloseTo(0.036, 5);
    expect(parsePctToRatio("0.4%")).toBeCloseTo(0.004, 5);
    expect(parsePctToRatio(31.4)).toBeCloseTo(0.314, 5);
    expect(parsePctToRatio("100%")).toBe(1);
    expect(parsePctToRatio("120%")).toBe(1); // clamp
    expect(parsePctToRatio("-5%")).toBe(0); // clamp
    expect(parsePctToRatio("")).toBeNull();
  });
});

describe("normalizeChannelRows", () => {
  it("parses the sample channels into ratios and keeps any channel set", () => {
    const r = normalizeChannelRows([
      { channel: "Walk-In", bookingsPct: "64.6%", coversPct: "63.9%" },
      { channel: "Repeater", bookingsPct: "31.4%", coversPct: "31.8%" },
      { channel: "Chope", bookingsPct: "3.6%", coversPct: "4.0%" },
      { channel: "Phone/WA", bookingsPct: "0.4%", coversPct: "0.3%" },
    ]);
    expect(r.rows).toHaveLength(4);
    expect(r.rows[0]!.channel).toBe("Walk-In");
    expect(r.rows[0]!.bookingsPct).toBeCloseTo(0.646, 5);
    expect(r.rows[0]!.coversPct).toBeCloseTo(0.639, 5);
    expect(r.rows[3]!.channel).toBe("Phone/WA");
    expect(r.skipped).toBe(0);
  });

  it("accepts the AI's alias keys (name/booking/cover) so rows aren't dropped", () => {
    const r = normalizeChannelRows([
      { name: "Walk-in", booking: "64.6", cover: "63.9" },
      { source: "Repeater", bookingShare: "31.4%", coverShare: "31.8%" },
    ] as never);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toEqual({ channel: "Walk-in", bookingsPct: expect.closeTo(0.646, 5), coversPct: expect.closeTo(0.639, 5) });
    expect(r.rows[1]!.channel).toBe("Repeater");
    expect(r.skipped).toBe(0);
  });

  it("drops TOTAL and rows missing a name or a percentage; de-dupes last-wins", () => {
    const r = normalizeChannelRows([
      { channel: "Walk-In", bookingsPct: "60%", coversPct: "60%" },
      { channel: "walk-in", bookingsPct: "64.6%", coversPct: "63.9%" }, // correction
      { channel: "TOTAL", bookingsPct: "100%", coversPct: "100%" },
      { channel: "Repeater", bookingsPct: "31.4%" }, // no cover %
      { channel: "", bookingsPct: "1%", coversPct: "1%" },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.channel).toBe("walk-in");
    expect(r.rows[0]!.bookingsPct).toBeCloseTo(0.646, 5);
    expect(r.skipped).toBe(3);
  });
});

describe("normalizeDailyRows", () => {
  it("keeps days 1–31 with bookings + covers, sorted, de-duped", () => {
    const r = normalizeDailyRows([
      { day: 3, bookings: 33, covers: 46 },
      { day: 1, bookings: 24, covers: 36 },
      { day: 1, bookings: 25, covers: 37 }, // last wins
      { day: 0, bookings: 5, covers: 5 }, // out of range
      { day: 32, bookings: 5, covers: 5 }, // out of range
      { day: 5, bookings: 10 }, // no covers
    ]);
    expect(r.rows.map((x) => x.day)).toEqual([1, 3]);
    expect(r.rows[0]).toEqual({ day: 1, bookings: 25, covers: 37 });
    // 3 invalid rows skipped (day 0, day 32, no-covers); the duplicate day 1 is
    // overwritten, not skipped.
    expect(r.skipped).toBe(3);
  });

  it("parses Indonesian numbers and clamps negatives", () => {
    const r = normalizeDailyRows([{ day: "7", bookings: "1.234", covers: "-3" }]);
    expect(r.rows[0]).toEqual({ day: 7, bookings: 1234, covers: 0 });
    expect(toInt("1.749")).toBe(1749);
  });

  it("accepts the AI's alias keys (date/booking/cover)", () => {
    const r = normalizeDailyRows([
      { date: 1, booking: 24, cover: 36 },
      { dayOfMonth: 2, bookingCount: 30, coverCount: 44 },
    ] as never);
    expect(r.rows.map((x) => x.day)).toEqual([1, 2]);
    expect(r.rows[0]).toEqual({ day: 1, bookings: 24, covers: 36 });
    expect(r.rows[1]).toEqual({ day: 2, bookings: 30, covers: 44 });
    expect(r.skipped).toBe(0);
  });
});

describe("channelLabel / sort", () => {
  it("labels known enum-style keys and passes free text through", () => {
    expect(channelLabel("WALK_IN")).toBe("Walk-in");
    expect(channelLabel("Walk-In")).toBe("Walk-in");
    expect(channelLabel("PHONE_WA")).toBe("Phone/WA");
    expect(channelLabel("Phone/WA")).toBe("Phone/WA");
    expect(channelLabel("Grab")).toBe("Grab"); // unknown → passthrough
  });

  it("orders known channels first, unknown after", () => {
    expect(channelSortKey("Walk-In")).toBe(0);
    expect(channelSortKey("Repeater")).toBe(1);
    expect(channelSortKey("Grab")).toBe(5);
  });
});
