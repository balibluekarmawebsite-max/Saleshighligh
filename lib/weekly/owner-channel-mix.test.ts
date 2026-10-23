import { describe, expect, it } from "vitest";

import { aggregateChannels, classifyChannel, CHANNELS } from "@/lib/weekly/owner-channel-mix";

describe("classifyChannel", () => {
  it("buckets OTA sources (case-insensitive, substring)", () => {
    for (const a of ["Booking.com", "AGODA", "Expedia Collect", "Traveloka", "Airbnb", "Klook"]) {
      expect(classifyChannel(a)).toBe("OTA");
    }
  });

  it("buckets direct / website / walk-in sources", () => {
    for (const a of ["Website", "Direct Booking", "Walk In Guest", "Group Retreat", "FIT"]) {
      expect(classifyChannel(a)).toBe("Direct Booking (Website/Walk In/Group Retreat)");
    }
  });

  it("falls back to Offline Travel Agents for anything else", () => {
    expect(classifyChannel("Some Local Travel Agent")).toBe("Offline Travel Agents");
    expect(classifyChannel("")).toBe("Offline Travel Agents");
  });

  it("checks OTA before direct when keywords overlap", () => {
    // "trip" (OTA) wins even though the label also reads like a direct retreat.
    expect(classifyChannel("Trip.com retreat")).toBe("OTA");
  });
});

describe("aggregateChannels", () => {
  it("rolls agent rows up into the three channels, in report order", () => {
    const rows = aggregateChannels([
      { label: "Agoda", rnSold: 10, grossRevenue: 1_000 },
      { label: "Booking.com", rnSold: 5, grossRevenue: 600 },
      { label: "Website", rnSold: 3, grossRevenue: 450 },
      { label: "PT Bali Tours", rnSold: 2, grossRevenue: 200 },
    ]);
    expect(rows.map((r) => r.label)).toEqual([
      "OTA",
      "Direct Booking (Website/Walk In/Group Retreat)",
      "Offline Travel Agents",
    ]);
    expect(rows[0]).toMatchObject({ label: "OTA", rnSold: 15, grossRevenue: 1_600 });
    expect(rows[1]).toMatchObject({ rnSold: 3, grossRevenue: 450 });
    expect(rows[2]).toMatchObject({ rnSold: 2, grossRevenue: 200 });
  });

  it("drops channels with no rows and ignores blank labels / nulls", () => {
    const rows = aggregateChannels([
      { label: "  ", rnSold: 99, grossRevenue: 99 },
      { label: "Agoda", rnSold: null, grossRevenue: 500 },
      { label: "Expedia", rnSold: 4, grossRevenue: null },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "OTA", rnSold: 4, grossRevenue: 500 });
  });

  it("returns nothing for an empty input", () => {
    expect(aggregateChannels([])).toEqual([]);
  });

  it("only ever emits the fixed channel set", () => {
    const rows = aggregateChannels([{ label: "whatever", rnSold: 1, grossRevenue: 1 }]);
    for (const r of rows) expect(CHANNELS).toContain(r.label);
  });
});
