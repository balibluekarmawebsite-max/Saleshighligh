import { describe, expect, it } from "vitest";

import { normalizeRoomTypeRows } from "@/lib/sales/room-type-logic";

describe("normalizeRoomTypeRows", () => {
  it("coerces numbers, derives ADR = revenue / nights, and sorts by revenue desc", () => {
    const r = normalizeRoomTypeRows([
      { roomType: "Premier Suite", roomNights: 120, revenue: 252_000_000 },
      { roomType: "Deluxe Room", roomNights: "210", revenue: "346,500,000" },
    ]);
    expect(r.rows[0]!.roomTypeName).toBe("Deluxe Room"); // higher revenue first
    expect(r.rows[0]!.adr).toBe(346_500_000 / 210);
    expect(r.rows[1]!.adr).toBe(252_000_000 / 120);
    expect(r.skipped).toBe(0);
  });

  it("merges duplicate room types and recomputes ADR consistently", () => {
    const r = normalizeRoomTypeRows([
      { roomType: "Pool Villa", roomNights: 50, revenue: 130_000_000 },
      { roomType: "pool villa", roomNights: 40, revenue: 104_000_000 },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.roomNights).toBe(90);
    expect(r.rows[0]!.revenue).toBe(234_000_000);
    expect(r.rows[0]!.adr).toBe(234_000_000 / 90);
    expect(r.merged).toBe(1);
  });

  it("skips rows with no name or bad numbers", () => {
    const r = normalizeRoomTypeRows([
      { roomType: "", roomNights: 10, revenue: 10 },
      { roomType: "Bad", roomNights: -5, revenue: 10 },
      { roomType: "Family Villa", roomNights: 34, revenue: 74_800_000 },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.roomTypeName).toBe("Family Villa");
    expect(r.skipped).toBe(2);
  });
});
