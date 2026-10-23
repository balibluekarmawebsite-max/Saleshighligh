import { describe, expect, it } from "vitest";

import { occupancyCollapseError, type OccReading } from "@/lib/daily/collapse-guard";

// BKDS-ish: 18 rooms → Oct saleable 558, Nov 540, Dec 558.
const r = (stayMonth: number, roomNights: number, saleableRooms = 558): OccReading => ({
  stayYear: 2026,
  stayMonth,
  roomNights,
  saleableRooms,
});

// A healthy prior reading (Oct 82%, Nov 53%, Dec 48%, Jan 34%).
const healthyPrior: OccReading[] = [r(10, 458), r(11, 286, 540), r(12, 268), r(1, 191, 558)];

describe("occupancyCollapseError", () => {
  it("rejects an empty pull that craters a healthy prior (the real bug)", () => {
    // An empty export zeroes every forward month at once → 4 collapses ≥ 3.
    const empty: OccReading[] = [r(10, 6), r(11, 0, 540), r(12, 1), r(1, 0, 558)];
    const err = occupancyCollapseError(empty, healthyPrior);
    expect(err).toBeTruthy();
    expect(err).toContain("2026-10");
    expect(err).toContain("broken or empty");
  });

  it("passes normal day-to-day movement (occupancy ticks up)", () => {
    const nextDay: OccReading[] = [r(10, 462), r(11, 290, 540), r(12, 271), r(1, 195, 558)];
    expect(occupancyCollapseError(nextDay, healthyPrior)).toBeNull();
  });

  it("passes a genuine single-month group cancellation", () => {
    // Nov drops hard (a group leaves) but the others hold — 1 month, not broken.
    const oneCancel: OccReading[] = [r(10, 455), r(11, 120, 540), r(12, 266), r(1, 190, 558)];
    expect(occupancyCollapseError(oneCancel, healthyPrior)).toBeNull();
  });

  it("passes a two-month cancellation (whole-villa booking straddling a boundary)", () => {
    // Nov + Dec both crater (one contract spanning the boundary cancels) but
    // that's 2 months — below the systemic threshold, so it's allowed through.
    const twoCancel: OccReading[] = [r(10, 455), r(11, 40, 540), r(12, 30), r(1, 190, 558)];
    expect(occupancyCollapseError(twoCancel, healthyPrior)).toBeNull();
  });

  it("skips when there is no prior snapshot (first pull)", () => {
    expect(occupancyCollapseError(healthyPrior, [])).toBeNull();
  });

  it("skips when the prior was itself low (lets a report recover)", () => {
    const lowPrior: OccReading[] = [r(10, 6), r(11, 0, 540), r(12, 1)];
    const good: OccReading[] = [r(10, 458), r(11, 286, 540), r(12, 268)];
    expect(occupancyCollapseError(good, lowPrior)).toBeNull();
  });

  it("ignores far-future low months (no meaningful prior to lose)", () => {
    // Prior far months are near-zero; a new near-zero is not a collapse.
    const priorFar: OccReading[] = [r(7, 2), r(8, 1), r(9, 0)];
    const newFar: OccReading[] = [r(7, 0), r(8, 0), r(9, 0)];
    expect(occupancyCollapseError(newFar, priorFar)).toBeNull();
  });

  it("does not trip on a single collapsed month among healthy ones", () => {
    const oneGone: OccReading[] = [r(10, 2), r(11, 285, 540), r(12, 267)];
    expect(occupancyCollapseError(oneGone, healthyPrior)).toBeNull();
  });
});
