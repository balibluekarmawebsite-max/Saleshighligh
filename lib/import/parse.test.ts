import { describe, it, expect } from "vitest";

import * as seed from "../../prisma/seed-data";
import { normalizeNumber, parseWorkbook } from "./parse";
import { DOMAINS } from "./schema";
import { generateFilledBuffer, generateTemplateBuffer } from "./template";

describe("normalizeNumber", () => {
  it("passes through JS numbers", () => {
    expect(normalizeNumber(1234.56)).toBe(1234.56);
    expect(normalizeNumber(0)).toBe(0);
  });
  it("parses Indonesian format (dot thousands, comma decimal)", () => {
    expect(normalizeNumber("1.234.567,89")).toBeCloseTo(1234567.89, 2);
    expect(normalizeNumber("0,84")).toBeCloseTo(0.84, 4);
    expect(normalizeNumber("687.347.372")).toBe(687347372);
  });
  it("parses US format (comma thousands, dot decimal)", () => {
    expect(normalizeNumber("1,234,567.89")).toBeCloseTo(1234567.89, 2);
    expect(normalizeNumber("1912489.08")).toBeCloseTo(1912489.08, 2);
  });
  it("strips currency symbols and spaces", () => {
    expect(normalizeNumber("Rp 1.500.000")).toBe(1500000);
  });
  it("returns null for empty / non-numeric", () => {
    expect(normalizeNumber("")).toBeNull();
    expect(normalizeNumber(null)).toBeNull();
    expect(normalizeNumber("abc")).toBeNull();
  });
});

describe("parseWorkbook", () => {
  it("parses a blank template with no errors (example rows are valid)", () => {
    const buf = generateTemplateBuffer({ propertyCode: "BKDS", period: "2026-06" });
    const result = parseWorkbook(buf, { expectedProperty: "BKDS", expectedPeriod: "2026-06" });
    expect(result.meta.propertyCode).toBe("BKDS");
    expect(result.meta.period).toBe("2026-06");
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("round-trips the filled sample cleanly with expected row counts", () => {
    const buf = generateFilledBuffer({
      propertyCode: "BKDS",
      period: "2026-06",
      dataByTab: {
        SUMMARY: seed.revenueSummaries,
        SEGMENT_MTD: seed.segmentProduction,
        ROOMTYPE: seed.roomTypeProduction,
        NATIONALITY_MTD: seed.nationalityProduction,
        LOS: seed.lengthOfStay,
        ACCOUNTS: seed.accountProduction,
        ADS: seed.adsPerformance,
        FNB_SALES: seed.fnbSales,
        FNB_SOB: seed.fnbSources,
        FNB_ACQUISITION: seed.fnbAcquisition,
        CHOPE: [seed.chopeReport],
        GOKAI: seed.gokaiReports,
        SPA_SALES: seed.spaSales,
        SPA_TREATMENTS: seed.spaTreatments,
        REPUTATION: seed.platformRankings,
        SOCIAL: seed.socialMediaMetrics,
        PACE: seed.bookingPace,
        FORECAST: seed.forecasts,
        INFLUENCERS: seed.influencerCollabs,
      },
    });
    const result = parseWorkbook(buf, { expectedProperty: "BKDS", expectedPeriod: "2026-06" });
    const errors = result.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    expect(result.counts.SUMMARY).toBe(seed.revenueSummaries.length);
    expect(result.counts.SEGMENT_MTD).toBe(seed.segmentProduction.length);
    expect(result.counts.ACCOUNTS).toBe(seed.accountProduction.length);
    expect(result.counts.CHOPE).toBe(1);

    // ACTUAL/BUDGET and injected scope survive the round-trip.
    const seg = result.domains.find((d) => d.tab === "SEGMENT_MTD");
    expect(seg?.rows[0]?.scope).toBe("MTD");
  });

  it("flags a property mismatch as an error", () => {
    const buf = generateTemplateBuffer({ propertyCode: "BKDS", period: "2026-06" });
    const result = parseWorkbook(buf, { expectedProperty: "BKDU", expectedPeriod: "2026-06" });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.problem.includes("does not match selection"))).toBe(true);
  });

  it("covers every domain tab", () => {
    const buf = generateTemplateBuffer({ propertyCode: "BKDS", period: "2026-06" });
    const result = parseWorkbook(buf);
    const tabs = result.domains.map((d) => d.tab).sort();
    expect(tabs).toEqual(DOMAINS.map((d) => d.tab).sort());
  });
});
