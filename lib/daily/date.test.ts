import { describe, expect, it } from "vitest";

import { isValidIsoDate } from "@/lib/daily/date";

describe("isValidIsoDate (snapshotDate guard)", () => {
  it("accepts real calendar dates", () => {
    expect(isValidIsoDate("2026-10-20")).toBe(true);
    expect(isValidIsoDate("2024-02-29")).toBe(true); // 2024 IS a leap year
    expect(isValidIsoDate("2026-01-01")).toBe(true);
    expect(isValidIsoDate("2026-12-31")).toBe(true);
  });

  it("rejects dates that JS would silently roll over to another day", () => {
    // These all pass the digit-grouping regex but new Date() rolls them over —
    // storing under the rolled day would overwrite a different snapshot.
    expect(isValidIsoDate("2026-02-29")).toBe(false); // 2026 is not a leap year -> Mar 1
    expect(isValidIsoDate("2026-02-30")).toBe(false); // -> Mar 2
    expect(isValidIsoDate("2026-04-31")).toBe(false); // -> May 1
    expect(isValidIsoDate("2026-11-31")).toBe(false); // -> Dec 1
    expect(isValidIsoDate("2026-13-01")).toBe(false); // month 13
    expect(isValidIsoDate("2026-00-10")).toBe(false); // month 00
    expect(isValidIsoDate("2026-10-00")).toBe(false); // day 00
  });

  it("rejects malformed strings", () => {
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate("20/10/2026")).toBe(false);
    expect(isValidIsoDate("2026-10-20T00:00:00Z")).toBe(false);
    expect(isValidIsoDate("2026-1-1")).toBe(false); // not zero-padded
    expect(isValidIsoDate("not-a-date")).toBe(false);
  });
});
