import { describe, expect, it } from "vitest";

import { occupancyPct, stayMonthPickup, type PickupPoint } from "@/lib/daily/calculations";

describe("occupancyPct", () => {
  it("is room nights ÷ saleable × 100", () => {
    // From the real BKV export: Oct Room Occupied 393, Saleable 465 -> 84.52%.
    expect(occupancyPct(393, 465)).toBeCloseTo(84.52, 2);
  });

  it("is null when the denominator is missing or zero", () => {
    expect(occupancyPct(10, null)).toBeNull();
    expect(occupancyPct(10, 0)).toBeNull();
  });
});

describe("stayMonthPickup", () => {
  it("sorts readings oldest→newest and derives the summary row", () => {
    const pts: PickupPoint[] = [
      { snapshotDate: "2026-10-03", roomNights: 70, saleableRooms: 100, revenue: 700_000 },
      { snapshotDate: "2026-10-01", roomNights: 50, saleableRooms: 100, revenue: 500_000 }, // out of order
      { snapshotDate: "2026-10-02", roomNights: 60, saleableRooms: 100, revenue: 600_000 },
    ];
    const r = stayMonthPickup(pts);

    expect(r.series.map((s) => s.snapshotDate)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(r.days).toBe(3);
    expect(r.occOnHand).toBeCloseTo(70, 6); // latest 70/100
    expect(r.roomSold).toBe(70); // latest room nights
    expect(r.revenue).toBe(700_000); // latest revenue
    expect(r.adr).toBeCloseTo(10_000, 6); // 700000 / 70
    expect(r.increasementPct).toBeCloseTo(20, 6); // 70% - 50%
    expect(r.avgPickupPerDay).toBeCloseTo(20 / 3, 6); // increasement ÷ readings
  });

  it("reproduces the Daily Report's Oct summary (latest reading drives it)", () => {
    // Oct tracked Oct 1 -> Oct 19 against 465 saleable room nights.
    const pts: PickupPoint[] = [
      { snapshotDate: "2026-10-01", roomNights: 361, saleableRooms: 465, revenue: 700_000_000 }, // 77.63%
      { snapshotDate: "2026-10-19", roomNights: 396, saleableRooms: 465, revenue: 861_308_339 }, // 85.16%
    ];
    const r = stayMonthPickup(pts);
    expect(r.occOnHand).toBeCloseTo(85.16, 2); // report: Occ on Hand 85.16%
    expect(r.roomSold).toBe(396); // report: Room Sold 396
    expect(r.revenue).toBe(861_308_339); // report: Revenue Nett
    expect(r.adr).toBeCloseTo(2_175_021, 0); // report: ADR 2,175,021
    expect(r.increasementPct).toBeCloseTo(7.53, 2); // report: Increasement % 7.53
    // Average Pickup/day = increasement ÷ readings (here 2; the report has 19).
    expect(r.avgPickupPerDay).toBeCloseTo((85.16129 - 77.63441) / 2, 4);
  });

  it("is empty-safe and single-reading-safe", () => {
    const empty = stayMonthPickup([]);
    expect(empty).toMatchObject({ days: 0, occOnHand: null, roomSold: 0, revenue: null, adr: null, increasementPct: null, avgPickupPerDay: null });

    const one = stayMonthPickup([{ snapshotDate: "2026-10-01", roomNights: 50, saleableRooms: 100, revenue: 500_000 }]);
    expect(one.days).toBe(1);
    expect(one.increasementPct).toBeCloseTo(0, 6); // first === latest
    expect(one.avgPickupPerDay).toBeCloseTo(0, 6);
  });

  it("yields null occupancy metrics when saleable rooms are absent", () => {
    const pts: PickupPoint[] = [
      { snapshotDate: "2026-10-01", roomNights: 50, saleableRooms: null, revenue: 500_000 },
      { snapshotDate: "2026-10-02", roomNights: 60, saleableRooms: null, revenue: 600_000 },
    ];
    const r = stayMonthPickup(pts);
    expect(r.occOnHand).toBeNull();
    expect(r.increasementPct).toBeNull();
    expect(r.avgPickupPerDay).toBeNull();
    // Non-occupancy metrics still work.
    expect(r.roomSold).toBe(60);
    expect(r.adr).toBeCloseTo(10_000, 6);
  });
});
