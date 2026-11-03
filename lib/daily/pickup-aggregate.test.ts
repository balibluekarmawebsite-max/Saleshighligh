import { describe, expect, it } from "vitest";

import { aggregatePickups, isSameDayCancelledLine, type RawPickupLine } from "@/lib/daily/pickup-aggregate";

describe("isSameDayCancelledLine", () => {
  it("is true when created === cancelled (same-day book-and-cancel)", () => {
    expect(isSameDayCancelledLine({ createdDate: "2026-11-02", cancelDate: "2026-11-02" })).toBe(true);
  });

  it("is false when cancelled on a later day (real pickup that day)", () => {
    expect(isSameDayCancelledLine({ createdDate: "2026-11-02", cancelDate: "2026-11-03" })).toBe(false);
  });

  it("is false for an active line (no cancel date)", () => {
    expect(isSameDayCancelledLine({ createdDate: "2026-11-02" })).toBe(false);
    expect(isSameDayCancelledLine({ createdDate: "2026-11-02", cancelDate: "" })).toBe(false);
  });

  it("honours an explicit sameDayCancelled override without dates", () => {
    expect(isSameDayCancelledLine({ agent: "Booking.com", sameDayCancelled: true })).toBe(true);
  });

  it("tolerates datetime strings by comparing the date part", () => {
    expect(
      isSameDayCancelledLine({ createdDate: "2026-11-02 09:15", cancelDate: "2026-11-02 21:40" }),
    ).toBe(true);
  });
});

describe("aggregatePickups", () => {
  it("sums Night × Room Quantity by agent and excludes same-day cancels", () => {
    const lines: RawPickupLine[] = [
      { reservationName: "Booking.com", night: 3, roomQuantity: 1, createdDate: "2026-11-02" },
      { reservationName: "Booking.com", night: 2, roomQuantity: 2, createdDate: "2026-11-02" }, // 4 RN
      // same-day book-and-cancel → excluded (would have been 5 RN):
      { reservationName: "Booking.com", night: 5, roomQuantity: 1, createdDate: "2026-11-02", cancelDate: "2026-11-02" },
      { reservationName: "Expedia", night: 1, roomQuantity: 1, createdDate: "2026-11-02" },
    ];
    const r = aggregatePickups(lines);

    expect(r.excludedLines).toBe(1);
    expect(r.excludedRoomNights).toBe(5);
    // Booking.com: 3 + 4 = 7 RN across 2 kept lines; Expedia 1 RN.
    expect(r.pickups).toEqual([
      { agent: "Booking.com", roomNights: 7, reservations: 2 },
      { agent: "Expedia", roomNights: 1, reservations: 1 },
    ]);
  });

  it("keeps a reservation cancelled on a later day as pickup", () => {
    const r = aggregatePickups([
      { reservationName: "G2 Travel", night: 2, roomQuantity: 1, createdDate: "2026-11-02", cancelDate: "2026-11-05" },
    ]);
    expect(r.excludedLines).toBe(0);
    expect(r.pickups).toEqual([{ agent: "G2 Travel", roomNights: 2, reservations: 1 }]);
  });

  it("normalises the agent label (before first comma, asterisks, whitespace)", () => {
    const r = aggregatePickups([
      { reservationName: "***INDIVIDUAL RESERVATION***", night: 1, roomQuantity: 1, createdDate: "2026-11-02" },
      { reservationName: "Booking.com, T&T", night: 1, roomQuantity: 1, createdDate: "2026-11-02" },
      { reservationName: "Booking.com,  Jane", night: 2, roomQuantity: 1, createdDate: "2026-11-02" },
    ]);
    // Both Booking.com variants merge; the individual label is cleaned.
    expect(r.pickups).toEqual([
      { agent: "Booking.com", roomNights: 3, reservations: 2 },
      { agent: "INDIVIDUAL RESERVATION", roomNights: 1, reservations: 1 },
    ]);
  });

  it("defaults Room Quantity to 1 and ignores junk counts", () => {
    const r = aggregatePickups([
      { reservationName: "Agoda", night: 4, createdDate: "2026-11-02" }, // qty missing -> 1
      { reservationName: "Agoda", night: "2", roomQuantity: "x", createdDate: "2026-11-02" }, // junk qty -> 1
    ]);
    expect(r.pickups).toEqual([{ agent: "Agoda", roomNights: 6, reservations: 2 }]);
  });

  it("drops lines with no agent but still counts an excluded same-day wash", () => {
    const r = aggregatePickups([
      { reservationName: "", night: 2, roomQuantity: 1, createdDate: "2026-11-02" }, // no agent -> skipped
      { reservationName: "", night: 3, roomQuantity: 1, sameDayCancelled: true }, // excluded wash
    ]);
    expect(r.pickups).toEqual([]);
    expect(r.excludedLines).toBe(1);
    expect(r.excludedRoomNights).toBe(3);
  });

  it("returns empty results for empty input", () => {
    expect(aggregatePickups([])).toEqual({ pickups: [], excludedLines: 0, excludedRoomNights: 0, skippedLines: 0 });
  });

  // --- Robustness: a bad row is skipped, never fatal (the feed is unvalidated) ---

  it("skips null / non-object entries instead of throwing", () => {
    const lines = [
      null,
      undefined,
      "oops",
      { reservationName: "Booking.com", night: 2, roomQuantity: 1, createdDate: "2026-11-02" },
    ] as unknown as Parameters<typeof aggregatePickups>[0];
    const r = aggregatePickups(lines);
    expect(r.pickups).toEqual([{ agent: "Booking.com", roomNights: 2, reservations: 1 }]);
    expect(r.skippedLines).toBe(3);
  });

  it("coerces a non-string agent / date instead of throwing", () => {
    const lines = [
      { reservationName: 123 as unknown as string, night: 2, roomQuantity: 1, createdDate: "2026-11-02" },
      { reservationName: "Expedia", night: 1, roomQuantity: 1, createdDate: 20261102 as unknown as string },
    ];
    // Neither throws; the numeric name becomes "123", the numeric date is just not a wash.
    const r = aggregatePickups(lines);
    expect(r.pickups).toContainEqual({ agent: "123", roomNights: 2, reservations: 1 });
    expect(r.pickups).toContainEqual({ agent: "Expedia", roomNights: 1, reservations: 1 });
  });

  it("falls back to the agent alias when reservationName is blank", () => {
    const r = aggregatePickups([
      { reservationName: "", agent: "Booking.com", night: 2, roomQuantity: 1, createdDate: "2026-11-02" },
    ]);
    expect(r.pickups).toEqual([{ agent: "Booking.com", roomNights: 2, reservations: 1 }]);
  });

  it("clamps negative counts and honours an explicit roomQuantity of 0", () => {
    const neg = aggregatePickups([
      { reservationName: "Booking.com", night: 5, roomQuantity: 1, createdDate: "2026-11-02" },
      { reservationName: "Booking.com", night: -3, roomQuantity: 1, createdDate: "2026-11-02" }, // can't subtract
    ]);
    expect(neg.pickups).toEqual([{ agent: "Booking.com", roomNights: 5, reservations: 2 }]);

    const zeroQty = aggregatePickups([
      { reservationName: "Agoda", night: 2, roomQuantity: 0, createdDate: "2026-11-02" }, // explicit 0 -> 0 RN
    ]);
    expect(zeroQty.pickups).toEqual([{ agent: "Agoda", roomNights: 0, reservations: 1 }]);
  });

  it("skips an absurd room-night magnitude (Int-overflow / misparse guard)", () => {
    const r = aggregatePickups([
      { reservationName: "Agoda", night: 100_000, roomQuantity: 100_000, createdDate: "2026-11-02" },
      { reservationName: "Booking.com", night: 2, roomQuantity: 1, createdDate: "2026-11-02" },
    ]);
    expect(r.pickups).toEqual([{ agent: "Booking.com", roomNights: 2, reservations: 1 }]);
    expect(r.skippedLines).toBe(1);
  });
});
