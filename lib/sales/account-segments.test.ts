import { describe, expect, it } from "vitest";

import {
  accountKey,
  classifySegment,
  EXCLUDE_SEGMENT,
  isExcluded,
  normalizeSegmentCode,
  orderSegments,
  resolveSegment,
  segmentLabel,
} from "@/lib/sales/account-segments";

describe("accountKey", () => {
  it("lowercases, trims and collapses whitespace (so odd spacing still matches)", () => {
    expect(accountKey("  BED4 TRAVEL ")).toBe("bed4 travel");
    expect(accountKey("T o t a l  USD")).toBe("t o t a l usd");
  });
});

describe("normalizeSegmentCode", () => {
  it("maps friendly + legacy spellings to codes", () => {
    expect(normalizeSegmentCode("OTA")).toBe("OTA");
    expect(normalizeSegmentCode("Travel Agent")).toBe("TRAVEL_AGENT");
    expect(normalizeSegmentCode("TA")).toBe("TRAVEL_AGENT");
    expect(normalizeSegmentCode("Wholesaler")).toBe("B2B"); // renamed
    expect(normalizeSegmentCode("B2B")).toBe("B2B");
    expect(normalizeSegmentCode("Overseas Travel Agent")).toBe("OVERSEAS_TRAVEL_AGENT");
    expect(normalizeSegmentCode("Direct Booking")).toBe("DIRECT_BOOKING");
    expect(normalizeSegmentCode("exclude")).toBe(EXCLUDE_SEGMENT);
  });
  it("returns null for blank/unknown", () => {
    expect(normalizeSegmentCode("")).toBeNull();
    expect(normalizeSegmentCode("mystery")).toBeNull();
  });
});

describe("classifySegment", () => {
  it("classifies known bookers", () => {
    expect(classifySegment("Booking.com")).toBe("OTA");
    expect(classifySegment("MakeMy Trip")).toBe("OTA");
    expect(classifySegment("Hotelbeds")).toBe("B2B");
    expect(classifySegment("G2 Travel")).toBe("B2B");
    expect(classifySegment("WALK IN")).toBe("DIRECT_BOOKING");
    expect(classifySegment("***INDIVIDUAL RESERVATION***")).toBe("DIRECT_BOOKING");
  });
  it("defaults unknown to Travel Agent", () => {
    expect(classifySegment("Asian Trails Indonesia")).toBe("TRAVEL_AGENT");
  });
});

describe("resolveSegment", () => {
  it("a saved rule wins over hint and name (incl. EXCLUDE)", () => {
    expect(resolveSegment("Luxury Escapes", { rule: "OVERSEAS_TRAVEL_AGENT", hint: "TA" })).toBe("OVERSEAS_TRAVEL_AGENT");
    expect(resolveSegment("ALARIC", { rule: "DIRECT_BOOKING" })).toBe("DIRECT_BOOKING");
    expect(resolveSegment("T o t a l USD", { rule: EXCLUDE_SEGMENT })).toBe(EXCLUDE_SEGMENT);
  });
  it("falls back to the sent hint, then to classification", () => {
    expect(resolveSegment("Some Agent", { hint: "Wholesaler" })).toBe("B2B");
    expect(resolveSegment("Booking.com", {})).toBe("OTA");
    expect(resolveSegment("Unknown Tour", {})).toBe("TRAVEL_AGENT");
  });
});

describe("orderSegments + labels", () => {
  it("orders present segments by the registry and labels them", () => {
    expect(orderSegments(["B2B", "DIRECT_BOOKING", "OTA"])).toEqual(["OTA", "B2B", "DIRECT_BOOKING"]);
    expect(segmentLabel("B2B")).toBe("B2B");
    expect(segmentLabel("OVERSEAS_TRAVEL_AGENT")).toBe("Overseas Travel Agent");
  });
  it("isExcluded flags the sentinel", () => {
    expect(isExcluded(EXCLUDE_SEGMENT)).toBe(true);
    expect(isExcluded("OTA")).toBe(false);
  });
});
