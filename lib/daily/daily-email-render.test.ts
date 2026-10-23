import { describe, expect, it } from "vitest";

import type { DailyEmailData } from "@/lib/daily/daily-email-data";
import { renderDailyEmail } from "@/lib/daily/daily-email-render";

const sample: DailyEmailData = {
  asOf: "2026-10-23",
  properties: [
    {
      code: "BKDS",
      name: "Blue Karma Dijiwa Seminyak",
      monthLabel: "October 2026",
      asOf: "2026-10-23",
      columns: [
        { label: "Oct 26", occOnHand: 82.08, roomSold: 458, revenue: 811574599, adr: 1771998, increasementPct: 8.6 },
        { label: "Nov 26", occOnHand: 52.96, roomSold: 286, revenue: 529882806, adr: 1852737, increasementPct: 5.93 },
        { label: "Jan 27", occOnHand: 34.23, roomSold: 191, revenue: 419418276, adr: 2195907, increasementPct: 1.25 },
      ],
    },
  ],
};

describe("renderDailyEmail", () => {
  it("renders subject, html and text from the data", () => {
    const out = renderDailyEmail(sample, { dashboardUrl: "https://dash.example.com" });
    expect(out.subject).toContain("23 Oct 2026");
    // Property + a formatted IDR figure appear in the HTML.
    expect(out.html).toContain("BKDS");
    expect(out.html).toContain("Blue Karma Dijiwa Seminyak");
    expect(out.html).toContain("82.1%"); // occ rounded to 1dp
    expect(out.html).toContain("Jan 27"); // forward 2027 month present
    expect(out.html).toContain('href="https://dash.example.com"');
    // Plain-text alternative covers the same figures.
    expect(out.text).toContain("BKDS");
    expect(out.text).toContain("occ 82.1%");
    expect(out.text).toContain("pickup +8.6%");
  });

  it("formats a missing value as an em dash, not NaN", () => {
    const data: DailyEmailData = {
      asOf: "2026-10-23",
      properties: [
        {
          code: "BKV", name: "Blue Karma Village", monthLabel: "October 2026", asOf: "2026-10-23",
          columns: [{ label: "Oct 26", occOnHand: null, roomSold: 0, revenue: null, adr: null, increasementPct: null }],
        },
      ],
    };
    const out = renderDailyEmail(data);
    expect(out.html).not.toContain("NaN");
    expect(out.html).toContain("—");
  });

  it("handles no data with a clear subject + message", () => {
    const out = renderDailyEmail({ properties: [], asOf: null });
    expect(out.subject).toContain("no data");
    expect(out.text).toContain("No occupancy snapshots");
  });
});
