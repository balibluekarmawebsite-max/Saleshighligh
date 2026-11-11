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
  it("maps friendly spellings + the full taxonomy to codes", () => {
    expect(normalizeSegmentCode("OTA")).toBe("OTA");
    expect(normalizeSegmentCode("Local TA")).toBe("LOCAL_TA");
    expect(normalizeSegmentCode("Overseas TA")).toBe("OVERSEAS_TA");
    expect(normalizeSegmentCode("B2B")).toBe("B2B");
    expect(normalizeSegmentCode("Overseas Wholesales")).toBe("OVERSEAS_WHOLESALE");
    expect(normalizeSegmentCode("Group MICE")).toBe("GROUP_MICE");
    expect(normalizeSegmentCode("Direct Booking")).toBe("DIRECT_BOOKING");
    expect(normalizeSegmentCode("exclude")).toBe(EXCLUDE_SEGMENT);
  });
  it("maps legacy codes forward (TRAVEL_AGENT → Local TA, Wholesaler → B2B)", () => {
    expect(normalizeSegmentCode("TRAVEL_AGENT")).toBe("LOCAL_TA");
    expect(normalizeSegmentCode("Travel Agent")).toBe("LOCAL_TA");
    expect(normalizeSegmentCode("OVERSEAS_TRAVEL_AGENT")).toBe("OVERSEAS_TA");
    expect(normalizeSegmentCode("Wholesaler")).toBe("B2B");
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
    expect(classifySegment("WALK IN")).toBe("WALK_IN");
    expect(classifySegment("***INDIVIDUAL RESERVATION***")).toBe("DIRECT_BOOKING");
  });
  it("defaults an unknown booker to Others (so it is flagged for review)", () => {
    expect(classifySegment("Asian Trails Indonesia")).toBe("OTHERS");
  });
});

describe("resolveSegment", () => {
  it("a saved rule wins over hint and name (incl. legacy + EXCLUDE)", () => {
    expect(resolveSegment("Luxury Escapes", { rule: "OVERSEAS_TRAVEL_AGENT", hint: "TA" })).toBe("OVERSEAS_TA");
    expect(resolveSegment("ALARIC", { rule: "DIRECT_BOOKING" })).toBe("DIRECT_BOOKING");
    expect(resolveSegment("T o t a l USD", { rule: EXCLUDE_SEGMENT })).toBe(EXCLUDE_SEGMENT);
  });
  it("falls back to the sent hint, then to classification (default Others)", () => {
    expect(resolveSegment("Some Agent", { hint: "Wholesaler" })).toBe("B2B");
    expect(resolveSegment("Booking.com", {})).toBe("OTA");
    expect(resolveSegment("Unknown Tour", {})).toBe("OTHERS");
  });
});

describe("orderSegments + labels", () => {
  it("orders present segments by the registry and labels them", () => {
    expect(orderSegments(["B2B", "DIRECT_BOOKING", "OTA"])).toEqual(["DIRECT_BOOKING", "OTA", "B2B"]);
    expect(segmentLabel("B2B")).toBe("B2B");
    expect(segmentLabel("OVERSEAS_TA")).toBe("Overseas TA");
    expect(segmentLabel("GROUP_MICE")).toBe("Group MICE");
  });
  it("isExcluded flags the sentinel", () => {
    expect(isExcluded(EXCLUDE_SEGMENT)).toBe(true);
    expect(isExcluded("OTA")).toBe(false);
  });
});
