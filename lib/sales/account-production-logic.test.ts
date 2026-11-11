import { describe, expect, it } from "vitest";

import { normalizeAccountRows } from "@/lib/sales/account-production-logic";

describe("normalizeAccountRows", () => {
  it("coerces numbers, keeps the type hint, and sorts by revenue desc", () => {
    const r = normalizeAccountRows([
      { account: "Expedia", type: "OTA", roomNights: 187, revenue: 304408058 },
      { account: "Booking.com", roomNights: "1,480", revenue: "2701269602" },
    ]);
    expect(r.rows[0]!.accountName).toBe("Booking.com"); // higher revenue first
    expect(r.rows[0]!.typeHint).toBeNull();
    expect(r.rows[1]!.accountName).toBe("Expedia");
    expect(r.rows[1]!.typeHint).toBe("OTA");
    expect(r.skipped).toBe(0);
  });

  it("merges duplicate accounts by summing and keeps a non-null hint", () => {
    const r = normalizeAccountRows([
      { account: "Agoda", roomNights: 40, revenue: 40_000_000 },
      { account: "AGODA", type: "OTA", roomNights: 23, revenue: 32_672_164 },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.roomNights).toBe(63);
    expect(r.rows[0]!.revenue).toBe(72_672_164);
    expect(r.rows[0]!.typeHint).toBe("OTA");
    expect(r.merged).toBe(1);
  });

  it("skips rows with no name or bad numbers", () => {
    const r = normalizeAccountRows([
      { account: "", roomNights: 10, revenue: 10 },
      { account: "Good", roomNights: -5, revenue: 10 },
      { account: "Fine", roomNights: 5, revenue: 100 },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.accountName).toBe("Fine");
    expect(r.skipped).toBe(2);
  });
});
