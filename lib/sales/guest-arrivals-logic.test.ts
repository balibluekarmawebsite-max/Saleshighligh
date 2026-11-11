import { describe, expect, it } from "vitest";

import { resolveCountry } from "@/lib/sales/countries";
import { compileGuestArrivals, losBucket } from "@/lib/sales/guest-arrivals-logic";

describe("resolveCountry", () => {
  it("resolves names, codes and common aliases", () => {
    expect(resolveCountry("Australia")).toEqual({ code: "AU", name: "Australia" });
    expect(resolveCountry("AU")).toEqual({ code: "AU", name: "Australia" });
    expect(resolveCountry("united kingdom")).toEqual({ code: "GB", name: "United Kingdom" });
    expect(resolveCountry("UK").code).toBe("GB");
    expect(resolveCountry("USA").code).toBe("US");
    expect(resolveCountry("South Korea").code).toBe("KR");
    expect(resolveCountry("Viet Nam").code).toBe("VN");
    expect(resolveCountry("SAUDI ARABIA").code).toBe("SA");
  });

  it("returns a null code (but keeps the raw name) for the unknown", () => {
    expect(resolveCountry("Westeros")).toEqual({ code: null, name: "Westeros" });
  });
});

describe("losBucket", () => {
  it("buckets nights with a 7+ cap", () => {
    expect(["1", "2", "6", "7+", "7+"].map((_, i) => losBucket([1, 2, 6, 7, 12][i]!))).toEqual([
      "1",
      "2",
      "6",
      "7+",
      "7+",
    ]);
  });
});

describe("compileGuestArrivals", () => {
  it("sums room nights per nationality from nights × rooms and ranks by room nights", () => {
    const r = compileGuestArrivals([
      { country: "Australia", arrival: "2026-06-01", departure: "2026-06-05", rooms: 1, guests: 2 }, // 4 RN
      { country: "Australia", nights: 2, rooms: 2, guests: 3 }, // 4 RN
      { country: "France", nights: 3, guests: 2 }, // 3 RN
    ]);
    expect(r.nationality[0]).toEqual({ countryCode: "AU", countryName: "Australia", roomNights: 8, guests: 5 });
    expect(r.nationality[1]).toEqual({ countryCode: "FR", countryName: "France", roomNights: 3, guests: 2 });
    expect(r.totals.roomNights).toBe(11);
    expect(r.totals.guests).toBe(7);
    expect(r.totals.arrivals).toBe(3);
  });

  it("builds a LOS distribution (bookings = reservations, RN summed, 7+ capped)", () => {
    const r = compileGuestArrivals([
      { country: "AU", nights: 1 },
      { country: "AU", nights: 3, rooms: 2 }, // 6 RN, bucket 3
      { country: "GB", nights: 9 }, // bucket 7+
    ]);
    const byBucket = Object.fromEntries(r.los.map((l) => [l.losBucket, l]));
    expect(byBucket["1"]).toEqual({ losBucket: "1", bookings: 1, roomNights: 1 });
    expect(byBucket["3"]).toEqual({ losBucket: "3", bookings: 1, roomNights: 6 });
    expect(byBucket["7+"]).toEqual({ losBucket: "7+", bookings: 1, roomNights: 9 });
    // ordered 1 → 7+
    expect(r.los.map((l) => l.losBucket)).toEqual(["1", "3", "7+"]);
  });

  it("merges by resolved country so 'AU' and 'Australia' combine", () => {
    const r = compileGuestArrivals([
      { country: "AU", nights: 2 },
      { country: "Australia", nights: 3 },
    ]);
    expect(r.nationality).toHaveLength(1);
    expect(r.nationality[0]!.roomNights).toBe(5);
  });

  it("skips rows with no country or no usable nights, and reports skipped", () => {
    const r = compileGuestArrivals([
      { country: "", nights: 3 },
      { country: "AU" }, // no nights, no roomNights → cannot contribute
      { country: "AU", roomNights: 5 }, // explicit RN, no nights → counts nationality, no LOS
      { country: "FR", nights: 2 },
    ]);
    expect(r.totals.skipped).toBe(2);
    expect(r.totals.arrivals).toBe(2);
    // the explicit-RN row has no nights, so it is absent from LOS
    expect(r.los.reduce((s, l) => s + l.bookings, 0)).toBe(1);
    expect(r.totals.guests).toBeNull(); // no guest figures supplied
  });
});
