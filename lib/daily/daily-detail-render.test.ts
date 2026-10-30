import { describe, expect, it } from "vitest";

import type { DailyDetailData } from "@/lib/daily/daily-detail-data";
import { renderDailyDetailEmail } from "@/lib/daily/daily-detail-render";

const sample: DailyDetailData = {
  refDate: "2026-10-29",
  properties: [
    {
      code: "BKV",
      name: "Blue Karma Village",
      roomCount: 15,
      refDate: "2026-10-29",
      pickupTotal: 21,
      cancelTotal: 23,
      onHand: [
        { label: "Oct", pct: 88.6 },
        { label: "Nov", pct: 63.78 },
        { label: "Dec", pct: 44.73 },
      ],
      pickupOtaOffline: [
        { agent: "Booking.com", rn: 16 },
        { agent: "G2 Travel", rn: 5 },
      ],
      pickupDirect: [],
      cancelByAgent: [
        { agent: "Booking.com", rn: 21 },
        { agent: "G2 Travel", rn: 2 },
      ],
      flow: [
        { heading: "Previous Day 29th October 2026", arrival: 2, departure: 3 },
        { heading: "Today", arrival: 7, departure: 7 },
        { heading: "Tomorrow", arrival: 5, departure: 4 },
      ],
    },
  ],
};

describe("renderDailyDetailEmail", () => {
  it("renders the long-form report in text + html", () => {
    const out = renderDailyDetailEmail(sample, { dashboardUrl: "https://dash.example.com/daily" });
    expect(out.subject).toContain("29 October 2026");
    // Text mirrors the team's manual format.
    expect(out.text).toContain("BLUE KARMA VILLAGE");
    expect(out.text).toContain("Yesterday pick up with 21 RN");
    expect(out.text).toContain("Yesterday cancellation with 23 RN");
    expect(out.text).toContain("Oct on hand at 88.60%");
    expect(out.text).toContain("OTA & Offline Agent : 21 RN");
    expect(out.text).toContain("Booking.com 16 RN");
    expect(out.text).toContain("Direct Pick up booking details : 0 RN");
    expect(out.text).toContain("The above on hand are based on 15 rooms");
    expect(out.text).toContain("Today Reservation");
    expect(out.text).toContain("•  Arrival: 7 Room");
    // HTML carries the property + a figure.
    expect(out.html).toContain("BLUE KARMA VILLAGE");
    expect(out.html).toContain("88.60%");
    expect(out.html).not.toContain("NaN");
  });

  it("is null-safe when a feed has no data", () => {
    const empty: DailyDetailData = {
      refDate: "2026-10-29",
      properties: [
        {
          code: "BKDS", name: "Blue Karma Dijiwa Seminyak", roomCount: 18, refDate: "2026-10-29",
          pickupTotal: 0, cancelTotal: 0, onHand: [],
          pickupOtaOffline: [], pickupDirect: [], cancelByAgent: [],
          flow: [{ heading: "Today", arrival: null, departure: null }],
        },
      ],
    };
    const out = renderDailyDetailEmail(empty);
    expect(out.html).not.toContain("NaN");
    expect(out.text).toContain("Yesterday pick up with 0 RN");
    expect(out.text).toContain("•  Arrival: — Room");
  });

  it("handles no properties", () => {
    const out = renderDailyDetailEmail({ properties: [], refDate: null });
    expect(out.subject).toContain("no data");
    expect(out.text).toContain("No reservation data");
  });
});
