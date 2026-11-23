import { describe, expect, it } from "vitest";

import {
  bookingWindowHasData,
  canonicalBucket,
  normalizeBookingWindowMeta,
  normalizeBookingWindowRows,
  parseAsOfDate,
} from "@/lib/sales/booking-window-logic";

describe("canonicalBucket", () => {
  it("maps dash variants and 91+/unspecified", () => {
    expect(canonicalBucket("0-1 day")).toBe("0–1 day");
    expect(canonicalBucket("0–1 day")).toBe("0–1 day");
    expect(canonicalBucket("15-30 days")).toBe("15–30 days");
    expect(canonicalBucket("91+ days")).toBe("91+ days");
    expect(canonicalBucket("91 + days")).toBe("91+ days");
    expect(canonicalBucket("Unspecified…")).toBe("Unspecified");
  });
  it("rejects unknown buckets", () => {
    expect(canonicalBucket("")).toBeNull();
    expect(canonicalBucket("200-300 days")).toBeNull();
    expect(canonicalBucket("hello")).toBeNull();
  });
});

describe("parseAsOfDate", () => {
  it("parses ISO and human dates", () => {
    expect(parseAsOfDate("2026-11-03")).toBe("2026-11-03");
    expect(parseAsOfDate("3 November 2026")).toBe("2026-11-03");
    expect(parseAsOfDate("")).toBeNull();
    expect(parseAsOfDate("not a date")).toBeNull();
  });
});

describe("normalizeBookingWindowMeta", () => {
  it("defaults the window label and coerces rooms + date", () => {
    expect(normalizeBookingWindowMeta({ totalBookedRooms: "211", dataAsOf: "2026-11-03" })).toEqual({
      windowLabel: "Last 90 days",
      dataAsOf: "2026-11-03",
      totalBookedRooms: 211,
    });
    expect(normalizeBookingWindowMeta({ window: "Last 30 days", totalBookedRooms: "" }).windowLabel).toBe("Last 30 days");
  });
});

describe("normalizeBookingWindowRows", () => {
  it("keeps recognised buckets (incl. zeros), dedupes, sorts canonically", () => {
    const out = normalizeBookingWindowRows([
      { bucket: "91+ days", propertyShare: "22", marketShare: "18", propertyAdr: "3900000", marketAdr: "2900000" },
      { bucket: "0-1 day", propertyShare: "18", marketShare: "26", propertyAdr: "3000000", marketAdr: "1500000" },
      { bucket: "Unspecified", propertyShare: "0", marketShare: "0", propertyAdr: "0", marketAdr: "0" },
      { bucket: "nonsense", propertyShare: "5" },
    ]);
    expect(out.map((r) => r.bucket)).toEqual(["0–1 day", "91+ days", "Unspecified"]);
    expect(bookingWindowHasData(out)).toBe(true);
    // Unspecified kept though all-zero
    expect(out[2]).toEqual({ bucket: "Unspecified", propertySharePct: 0, marketSharePct: 0, propertyAdr: 0, marketAdr: 0 });
  });

  it("reports no data when every bucket is zero", () => {
    const out = normalizeBookingWindowRows([{ bucket: "0-1 day", propertyShare: "0", marketShare: "0", propertyAdr: "0", marketAdr: "0" }]);
    expect(out).toHaveLength(1);
    expect(bookingWindowHasData(out)).toBe(false);
  });

  it("clamps share to 100 and parses Indonesian ADR", () => {
    const out = normalizeBookingWindowRows([{ bucket: "2-3 days", propertyShare: "140", marketShare: "9", propertyAdr: "2.300.000", marketAdr: "1.200.000" }]);
    expect(out[0]?.propertySharePct).toBe(100);
    expect(out[0]?.propertyAdr).toBe(2300000);
  });
});
