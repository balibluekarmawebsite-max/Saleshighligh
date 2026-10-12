import { describe, expect, it } from "vitest";

import { resolveSection } from "@/lib/weekly/import/section-resolve";

/**
 * Section resolution for the token-gated push endpoint — the scraper may send a
 * public letter (B, C, …) or an internal id (monthly, segment, …).
 */
describe("resolveSection", () => {
  const id = (raw: string): string => {
    const r = resolveSection(raw);
    if ("error" in r) throw new Error(`expected a section for "${raw}", got error: ${r.error}`);
    return r.id;
  };

  it("maps the yearly-forecast letter B to the monthly section", () => {
    expect(id("B")).toBe("monthly");
    expect(id("b")).toBe("monthly");
  });

  it("maps the reservation letter C to the segment section", () => {
    expect(id("C")).toBe("segment");
  });

  it("maps D to ratecode", () => {
    expect(id("D")).toBe("ratecode");
  });

  it("maps the channel letter in several spellings", () => {
    expect(id("EF")).toBe("channel");
    expect(id("ef")).toBe("channel");
    expect(id("E/F")).toBe("channel");
  });

  it("accepts internal ids directly", () => {
    expect(id("monthly")).toBe("monthly");
    expect(id("segment")).toBe("segment");
    expect(id("channel")).toBe("channel");
    expect(id("social")).toBe("social");
  });

  it("trims and is case-insensitive", () => {
    expect(id("  Segment  ")).toBe("segment");
    expect(id(" c ")).toBe("segment");
  });

  it("rejects an unknown section", () => {
    const r = resolveSection("Z");
    expect("error" in r).toBe(true);
  });

  it("rejects a blank section", () => {
    const r = resolveSection("   ");
    expect("error" in r).toBe(true);
  });

  it("flags the ambiguous OWNER letter (two owner sections share it)", () => {
    const r = resolveSection("OWNER");
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.error.toLowerCase()).toContain("ambiguous");
  });
});
