import { describe, expect, it } from "vitest";

import {
  classifyAccountType,
  normalizeAccountRows,
  parseAccountType,
} from "@/lib/sales/account-production-logic";

describe("classifyAccountType", () => {
  it("classifies the known bookers", () => {
    expect(classifyAccountType("Booking.com")).toBe("OTA");
    expect(classifyAccountType("Expedia")).toBe("OTA");
    expect(classifyAccountType("Agoda")).toBe("OTA");
    expect(classifyAccountType("Klook")).toBe("OTA");
    expect(classifyAccountType("Hotelbeds")).toBe("WHOLESALER");
    expect(classifyAccountType("G2 Travel")).toBe("WHOLESALER");
    expect(classifyAccountType("MG Holiday")).toBe("WHOLESALER");
  });

  it("defaults an unknown booker to Travel Agent", () => {
    expect(classifyAccountType("Luxury Escape")).toBe("TA");
    expect(classifyAccountType("Asian Trails Indonesia")).toBe("TA");
  });

  it("spots a corporate hint", () => {
    expect(classifyAccountType("Acme Corporate Account")).toBe("CORPORATE");
  });
});

describe("parseAccountType", () => {
  it("accepts the enum and friendly spellings", () => {
    expect(parseAccountType("OTA")).toBe("OTA");
    expect(parseAccountType("Travel Agent")).toBe("TA");
    expect(parseAccountType("ta")).toBe("TA");
    expect(parseAccountType("Wholesaler")).toBe("WHOLESALER");
    expect(parseAccountType("corporate")).toBe("CORPORATE");
  });
  it("returns null for blank/unknown", () => {
    expect(parseAccountType("")).toBeNull();
    expect(parseAccountType("mystery")).toBeNull();
  });
});

describe("normalizeAccountRows", () => {
  it("coerces, resolves type (scraper wins) and sorts by revenue desc", () => {
    const r = normalizeAccountRows([
      { account: "Expedia", type: "OTA", roomNights: 187, revenue: 304408058 },
      { account: "Booking.com", roomNights: "1,480", revenue: "2701269602" },
    ]);
    expect(r.rows[0]!.accountName).toBe("Booking.com"); // higher revenue first
    expect(r.rows[0]!.accountType).toBe("OTA"); // classified
    expect(r.rows[1]!.accountName).toBe("Expedia");
    expect(r.classified).toBe(1); // Booking.com had no type
    expect(r.skipped).toBe(0);
  });

  it("merges duplicate accounts by summing", () => {
    const r = normalizeAccountRows([
      { account: "Agoda", type: "OTA", roomNights: 40, revenue: 40_000_000 },
      { account: "AGODA", type: "OTA", roomNights: 23, revenue: 32_672_164 },
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.roomNights).toBe(63);
    expect(r.rows[0]!.revenue).toBe(72_672_164);
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
