import { describe, expect, it } from "vitest";

import { parsePickupForecast } from "@/lib/daily/parse-pickup";

/**
 * Real "Yearly Forecast Of Room Occupancy" summary + revenue rows (BKDS), the
 * same export the weekly Section B parser reads — here captured as a daily
 * occupancy-pickup snapshot keeping ALL 12 forward months.
 */
const FORECAST_CSV = [
  "BALI BLUE KARMA",
  "Yearly Forecast Of Room Occupancy",
  "",
  '"Date","01/10 Oct ","01/11 Nov ","01/12 Dec ","01/01 Jan ","01/02 Feb ","01/03 Mar ","01/04 Apr ","01/05 May ","01/06 Jun ","01/07 Jul ","01/08 Aug ","01/09 Sep "',
  '" 1 ","15","11","6","8","2","5","5","9","5","1","1","1"',
  '" 2 ","16","6","8","6","3","10","3","9","5","1","1","1"',
  '" "," "," "," "," "," "," "," "," "," "," "," "," "',
  '" Room Occupied","457.00","331.00","271.00","220.00","131.00","145.00","98.00","129.00","125.00","83.00","79.00","52.00"',
  '" Saleable Rooms","558.00","540.00","558.00","558.00","504.00","558.00","540.00","558.00","540.00","558.00","558.00","540.00"',
  '" Occupancy (%)","81.90","61.30","48.57","39.43","25.99","25.99","18.15","23.12","23.15","14.87","14.16","9.63"',
  '"Person Occupied","855.00","655.00","608.00","449.00","256.00","250.00","174.00","274.00","220.00","175.00","175.00","81.00"',
  '"Period","Oct ","Nov ","Dec ","Jan ","Feb ","Mar "',
  '"Room Revenue"," 821,658,439"," 577,082,116"," 557,904,971"," 420,519,107"," 175,309,984"," 231,528,048"',
  '"Period","Apr ","May ","Jun ","Jul ","Aug ","Sep "',
  '"Room Revenue"," 104,008,418"," 162,365,883"," 239,163,060"," 196,611,234"," 123,793,657"," 58,530,277"',
].join("\n") + "\n";

describe("parsePickupForecast", () => {
  it("keeps all 12 forward stay-months with correct rollover years", () => {
    const rows = parsePickupForecast(FORECAST_CSV, 2026);
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(12);

    // Oct/Nov/Dec are 2026; Jan–Sep roll into 2027 (unlike Section B, which
    // drops the next-year columns).
    expect(rows!.map((r) => `${r.stayYear}-${String(r.stayMonth).padStart(2, "0")}`)).toEqual([
      "2026-10", "2026-11", "2026-12",
      "2027-01", "2027-02", "2027-03", "2027-04", "2027-05",
      "2027-06", "2027-07", "2027-08", "2027-09",
    ]);
  });

  it("reads room nights, saleable rooms and revenue per stay month", () => {
    const rows = parsePickupForecast(FORECAST_CSV, 2026)!;
    const by = new Map(rows.map((r) => [`${r.stayYear}-${String(r.stayMonth).padStart(2, "0")}`, r]));

    expect(by.get("2026-10")).toEqual({ stayYear: 2026, stayMonth: 10, roomNights: 457, saleableRooms: 558, revenue: 821658439 });
    expect(by.get("2026-11")).toEqual({ stayYear: 2026, stayMonth: 11, roomNights: 331, saleableRooms: 540, revenue: 577082116 });
    expect(by.get("2026-12")).toEqual({ stayYear: 2026, stayMonth: 12, roomNights: 271, saleableRooms: 558, revenue: 557904971 });
    expect(by.get("2027-01")).toEqual({ stayYear: 2027, stayMonth: 1, roomNights: 220, saleableRooms: 558, revenue: 420519107 });
    expect(by.get("2027-09")).toEqual({ stayYear: 2027, stayMonth: 9, roomNights: 52, saleableRooms: 540, revenue: 58530277 });
  });

  it("does NOT mistake the 'SaleRoom w/ OOO' row for 'Saleable Rooms'", () => {
    // The real export has both; only the exact "Saleable Rooms" label is the
    // occupancy denominator.
    const csv =
      [
        "Yearly Forecast Of Room Occupancy",
        '"Date","01/10 Oct "',
        '"  Room Occupied","393.00"',
        '" Saleable Rooms","465.00"',
        '"SaleRoom w/ OOO","435"',
      ].join("\n") + "\n";
    const rows = parsePickupForecast(csv, 2026)!;
    expect(rows[0]!.saleableRooms).toBe(465);
  });

  it("totals the on-the-books room nights across the window", () => {
    const rows = parsePickupForecast(FORECAST_CSV, 2026)!;
    const total = rows.reduce((s, r) => s + r.roomNights, 0);
    expect(total).toBe(2121);
  });

  it("anchors a January-start forecast entirely in the report year", () => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const roomOcc = [186, 103, 114, 55, 74, 98, 49, 40, 22, 449, 300, 420];
    const revenue = [558, 206, 228, 110, 148, 196, 98, 80, 44, 898, 600, 840].map((m) => m * 1_000_000);
    const row = (label: string, vals: (string | number)[]) =>
      `"${label}",` + vals.map((v) => `"${v}"`).join(",");
    const dateHdr = '"Date",' + months.map((m, i) => `"01/${String(i + 1).padStart(2, "0")} ${m} "`).join(",");
    const janCsv =
      [
        "BALI BLUE KARMA",
        "Yearly Forecast Of Room Occupancy",
        "",
        dateHdr,
        row(" Room Occupied", roomOcc.map((n) => n.toFixed(2))),
        row("Period", months.slice(0, 6).map((m) => `${m} `)),
        row("Room Revenue", revenue.slice(0, 6)),
        row("Period", months.slice(6).map((m) => `${m} `)),
        row("Room Revenue", revenue.slice(6)),
      ].join("\n") + "\n";

    const rows = parsePickupForecast(janCsv, 2026)!;
    expect(rows.length).toBe(12);
    expect(rows.every((r) => r.stayYear === 2026)).toBe(true);
    expect(rows.map((r) => r.stayMonth)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(rows[0]).toEqual({ stayYear: 2026, stayMonth: 1, roomNights: 186, saleableRooms: null, revenue: 558_000_000 });
  });

  it("keeps a far month with no revenue block as a zero/null row", () => {
    // Only a Date header + Room Occupied, no Period/Room Revenue blocks.
    const csv =
      [
        "Yearly Forecast Of Room Occupancy",
        '"Date","01/10 Oct ","01/11 Nov "',
        '" Room Occupied","10.00","0.00"',
      ].join("\n") + "\n";
    const rows = parsePickupForecast(csv, 2026)!;
    expect(rows).toEqual([
      { stayYear: 2026, stayMonth: 10, roomNights: 10, saleableRooms: null, revenue: null },
      { stayYear: 2026, stayMonth: 11, roomNights: 0, saleableRooms: null, revenue: null },
    ]);
  });

  it("returns null for a non-forecast CSV (so ingestion can reject it)", () => {
    expect(parsePickupForecast("Month,Occ,Rev\n1,80,100\n", 2026)).toBeNull();
    expect(parsePickupForecast("nope", 2026)).toBeNull();
    expect(parsePickupForecast("", 2026)).toBeNull();
  });
});
