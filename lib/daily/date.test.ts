import { describe, expect, it } from "vitest";

import { isValidIsoDate, witaDateIso } from "@/lib/daily/date";

describe("witaDateIso (Bali UTC+8)", () => {
  it("rolls to the WITA calendar day, which is ahead of UTC", () => {
    // Oct 22 23:00 UTC = Oct 23 07:00 WITA.
    const t = Date.UTC(2026, 9, 22, 23, 0, 0);
    expect(witaDateIso(t, 0)).toBe("2026-10-23"); // today, WITA
    expect(witaDateIso(t, -1)).toBe("2026-10-22"); // yesterday, WITA
  });

  it("gives yesterday even late in the WITA day", () => {
    // Oct 23 15:00 UTC = Oct 23 23:00 WITA — still Oct 23 locally.
    const t = Date.UTC(2026, 9, 23, 15, 0, 0);
    expect(witaDateIso(t, 0)).toBe("2026-10-23");
    expect(witaDateIso(t, -1)).toBe("2026-10-22");
  });
});

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
