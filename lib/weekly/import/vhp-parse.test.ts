import { describe, expect, it } from "vitest";

import {
  parseCsv,
  parseVhpForecastToMonthly,
  parseVhpReservationsByAgent,
} from "@/lib/weekly/import/vhp-parse";

/**
 * Real "Reservation By Creation Date" sample (the first 18 rows of a BKDS
 * export): report-title junk at the top, a quoted header, embedded commas in
 * the "Reservation Name" (agent) and guest names / money, and a mix of statuses
 * (Guaranted / Departed / AccGuest / Cancelled) and zero-quantity companion
 * lines.
 */
const HEADER_JUNK = [
  "BALI BLUE KARMA",
  "Jl. Seminyak, Gang Bima No. 2 Kuta,,,,,,,,,,,,Date: 12/10/2026",
  "",
  "Tel +62-(361) 737898,,,,,,,,,,,,Period: 05/10/26 - 11/10/26",
  "Reservation By Creation Date",
  "",
].join("\n");

const COLUMNS =
  '"No","Created Date","Reservation Number","Reservation Name","Arrival","Departure","Room Number","Room Quantity","Night","Room Type","Nationality","Adult","Child","Compliment","Arrangement","Rate Code","Room Rate","Total Revenue","Guest Name","Segment","Voucher No","SOB","Status","Created By","Created Id","Last Changed Date","Changed By"';

// Each row: [No, RoomQty, Night, TotalRevenue, ReservationName (agent), GuestName, Segment, Status]
const DATA: [string, string, string, string, string, string, string, string][] = [
  ["1", "1", "4", "21,600,000.00", "Booking.com", "Adan, Kathleen ", "FIT-OTA", "Guaranted"],
  ["2", "1", "6", "18,242,280.00", "Booking.com", "Park, Gary ", "FIT-OTA", "Guaranted"],
  ["3", "1", "6", "18,242,280.00", "Booking.com", "Park, Gary ", "FIT-OTA", "Guaranted"],
  ["4", "1", "5", "18,737,300.00", "Expedia", "Kelly, Donna ", "FIT-OTA", "Guaranted"],
  ["5", "1", "1", "2,135,363.00", "Booking.com", "Yoko, Ikegaki ", "FIT-OTA", "Cancelled"],
  ["6", "1", "3", "21,009,449.00", "Booking.com", "Palm, Jiske ", "FIT-OTA", "Guaranted"],
  ["7", "1", "2", "4,843,844.00", "Booking.com, T&T", "***INDIVIDUAL RESERVATION***,  ", "FIT-OTA", "Cancelled"],
  ["8", "1", "1", "0.00", "Booking.com, T&T", "***INDIVIDUAL RESERVATION***,  ", "FIT-OTA", "Cancelled"],
  ["9", "1", "3", "6,975,000.00", "Expedia", "osei, Loretta ", "FIT-OTA", "Guaranted"],
  ["10", "1", "3", "7,603,800.00", "***INDIVIDUAL RESERVATION***", "Aiden Concepcion,   MR", "FIT", "Guaranted"],
  ["11", "1", "5", "16,533,421.00", "Expedia", "RANDALL, BELINDA M ", "FIT-OTA", "Guaranted"],
  ["12", "1", "1", "3,118,050.00", "Booking.com, T&T", "Herlina Gunawan,   IBU", "FIT-OTA", "Departed"],
  ["13", "0", "0", "0.00", "Booking.com, T&T", "Lina , Widjaja  IBU", "FIT-OTA", "Cancelled"],
  ["14", "1", "1", "2,421,922.00", "Booking.com, T&T", "Herlina Gunawan,   IBU", "FIT-OTA", "Departed"],
  ["15", "0", "0", "0.00", "Booking.com, T&T", "Lina , Widjaja  IBU", "FIT-OTA", "Cancelled"],
  ["16", "1", "1", "1,976,122.00", "Expedia", "Hideki , Iwasaki MR", "FIT-OTA", "Guaranted"],
  ["17", "0", "0", "0.00", "Expedia", "Sato, Asami MS", "FIT-OTA", "AccGuest"],
  ["18", "1", "1", "1,800,000.00", "***INDIVIDUAL RESERVATION***", "Flowers, Joelle Olivia MS", "FIT", "Departed"],
];

function buildRow(d: (typeof DATA)[number]): string {
  const [no, qty, night, rev, agent, guest, seg, status] = d;
  // Fill the 27 columns, with the read-relevant ones in their real positions.
  const cells = [
    no, "2026-10-05", "238" + no, agent, "2026-11-01", "2026-11-05",
    "LOT", qty, night, "1BPVL", "USA", "2", "0", "0", "BB24", "STIDR",
    "1,000,000.00", rev, guest, seg, "123'", "ONLINE TRAVEL AGENT", status,
    "User Not Found", "**", "", "",
  ];
  return cells.map((c) => `"${c}"`).join(",");
}

const SAMPLE_CSV = [HEADER_JUNK, COLUMNS, ...DATA.map(buildRow)].join("\n") + "\n";

describe("parseCsv", () => {
  it("handles quoted fields with embedded commas", () => {
    const rows = parseCsv('"a","b, c","d"\n"1","2,3","4"\n');
    expect(rows[0]).toEqual(["a", "b, c", "d"]);
    expect(rows[1]).toEqual(["1", "2,3", "4"]);
  });

  it("handles escaped double-quotes", () => {
    const rows = parseCsv('"he said ""hi""","x"\n');
    expect(rows[0]).toEqual(['he said "hi"', "x"]);
  });
});

describe("parseVhpReservationsByAgent", () => {
  it("aggregates by booking agent, excludes cancellations, and sums exactly", () => {
    const rows = parseVhpReservationsByAgent(SAMPLE_CSV);
    expect(rows).not.toBeNull();
    const byLabel = new Map(rows!.map((r) => [r.label, r]));

    // Booking.com (merges "Booking.com" + the "Booking.com, T&T" booker suffix):
    // surviving rows 1,2,3,6,12,14 (cancelled 5,7,8,13,15 excluded).
    // RN  = 4+6+6+3+1+1 = 21
    // Rev = 21.6M+18.24228M+18.24228M+21.009449M+3.11805M+2.421922M = 84,633,981
    expect(byLabel.get("Booking.com")).toEqual({ label: "Booking.com", rnSold: "21", grossRevenue: "84633981" });

    // Expedia: rows 4,9,11,16,17 (17 is AccGuest, contributes 0 RN/rev).
    // RN  = 5+3+5+1+0 = 14
    // Rev = 18.7373M+6.975M+16.533421M+1.976122M = 44,221,843
    expect(byLabel.get("Expedia")).toEqual({ label: "Expedia", rnSold: "14", grossRevenue: "44221843" });

    // Individual reservations ("***INDIVIDUAL RESERVATION***" → asterisks stripped):
    // rows 10,18 → RN 3+1 = 4, Rev 7,603,800 + 1,800,000 = 9,403,800
    expect(byLabel.get("INDIVIDUAL RESERVATION")).toEqual({
      label: "INDIVIDUAL RESERVATION",
      rnSold: "4",
      grossRevenue: "9403800",
    });
  });

  it("sorts agents by revenue descending", () => {
    const rows = parseVhpReservationsByAgent(SAMPLE_CSV)!;
    expect(rows.map((r) => r.label)).toEqual(["Booking.com", "Expedia", "INDIVIDUAL RESERVATION"]);
  });

  it("returns null for a non-reservation CSV (falls back to AI)", () => {
    expect(parseVhpReservationsByAgent("Segment,RN,Revenue\nOTA,10,5000000\n")).toBeNull();
    expect(parseVhpReservationsByAgent("just some text")).toBeNull();
  });
});

/** Real "Yearly Forecast Of Room Occupancy" summary + revenue rows (BKDS). */
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

describe("parseVhpForecastToMonthly", () => {
  it("extracts the report-year months (Oct report → Oct/Nov/Dec only)", () => {
    const rows = parseVhpForecastToMonthly(FORECAST_CSV, 2026);
    expect(rows).not.toBeNull();
    // Oct/Nov/Dec are 2026; Jan–Sep columns are 2027 and must be skipped.
    expect(rows!.map((r) => r.month)).toEqual(["10", "11", "12"]);

    const byMonth = new Map(rows!.map((r) => [r.month, r]));
    // ADR = Room Revenue ÷ Room Occupied, rounded.
    expect(byMonth.get("10")).toEqual({ month: "10", rnSold: "457", occActual: "81.9", revActual: "821658439", arrActual: "1797940" });
    expect(byMonth.get("11")).toEqual({ month: "11", rnSold: "331", occActual: "61.3", revActual: "577082116", arrActual: "1743451" });
    expect(byMonth.get("12")).toEqual({ month: "12", rnSold: "271", occActual: "48.57", revActual: "557904971", arrActual: "2058690" });
  });

  it("keeps all 12 months for a January-start run (full-year backfill)", () => {
    // VHP "Month" selector set to January → the export window is Jan–Dec, all
    // in the report year, so a single pull backfills the whole year.
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dateHdr = '"Date",' + months.map((m, i) => `"01/${String(i + 1).padStart(2, "0")} ${m} "`).join(",");
    const occRow = '" Room Occupied",' + months.map(() => '"100.00"').join(",");
    const pctRow = '" Occupancy (%)",' + months.map(() => '"40.00"').join(",");
    const janCsv =
      ["BALI BLUE KARMA", "Yearly Forecast Of Room Occupancy", "", dateHdr, occRow, pctRow].join("\n") + "\n";

    const rows = parseVhpForecastToMonthly(janCsv, 2026);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => r.month)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
    expect(rows!.every((r) => r.rnSold === "100" && r.occActual === "40")).toBe(true);
  });

  it("returns null for a non-forecast CSV (falls back to AI)", () => {
    expect(parseVhpForecastToMonthly("Month,Occ,Rev\n1,80,100\n", 2026)).toBeNull();
    expect(parseVhpForecastToMonthly("nope", 2026)).toBeNull();
  });
});
