import { describe, expect, it } from "vitest";

import { parseCsv, parseVhpReservationsToSegments } from "@/lib/weekly/import/vhp-parse";

/**
 * Real "Reservation By Creation Date" sample (the first 18 rows of a BKDS
 * export): report-title junk at the top, a quoted header, embedded commas in
 * names / money, and a mix of statuses (Guaranted / Departed / AccGuest /
 * Cancelled) and zero-quantity companion lines.
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

// Each row: [No, RoomQty, Night, TotalRevenue, GuestName, Segment, Status]
const DATA: [string, string, string, string, string, string, string][] = [
  ["1", "1", "4", "21,600,000.00", "Adan, Kathleen ", "FIT-OTA", "Guaranted"],
  ["2", "1", "6", "18,242,280.00", "Park, Gary ", "FIT-OTA", "Guaranted"],
  ["3", "1", "6", "18,242,280.00", "Park, Gary ", "FIT-OTA", "Guaranted"],
  ["4", "1", "5", "18,737,300.00", "Kelly, Donna ", "FIT-OTA", "Guaranted"],
  ["5", "1", "1", "2,135,363.00", "Yoko, Ikegaki ", "FIT-OTA", "Cancelled"],
  ["6", "1", "3", "21,009,449.00", "Palm, Jiske ", "FIT-OTA", "Guaranted"],
  ["7", "1", "2", "4,843,844.00", "***INDIVIDUAL RESERVATION***,  ", "FIT-OTA", "Cancelled"],
  ["8", "1", "1", "0.00", "***INDIVIDUAL RESERVATION***,  ", "FIT-OTA", "Cancelled"],
  ["9", "1", "3", "6,975,000.00", "osei, Loretta ", "FIT-OTA", "Guaranted"],
  ["10", "1", "3", "7,603,800.00", "Aiden Concepcion,   MR", "FIT", "Guaranted"],
  ["11", "1", "5", "16,533,421.00", "RANDALL, BELINDA M ", "FIT-OTA", "Guaranted"],
  ["12", "1", "1", "3,118,050.00", "Herlina Gunawan,   IBU", "FIT-OTA", "Departed"],
  ["13", "0", "0", "0.00", "Lina , Widjaja  IBU", "FIT-OTA", "Cancelled"],
  ["14", "1", "1", "2,421,922.00", "Herlina Gunawan,   IBU", "FIT-OTA", "Departed"],
  ["15", "0", "0", "0.00", "Lina , Widjaja  IBU", "FIT-OTA", "Cancelled"],
  ["16", "1", "1", "1,976,122.00", "Hideki , Iwasaki MR", "FIT-OTA", "Guaranted"],
  ["17", "0", "0", "0.00", "Sato, Asami MS", "FIT-OTA", "AccGuest"],
  ["18", "1", "1", "1,800,000.00", "Flowers, Joelle Olivia MS", "FIT", "Departed"],
];

function buildRow(d: (typeof DATA)[number]): string {
  const [no, qty, night, rev, guest, seg, status] = d;
  // Fill the 27 columns, with the read-relevant ones in their real positions.
  const cells = [
    no, "2026-10-05", "238" + no, "Booking.com, T&T", "2026-11-01", "2026-11-05",
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

describe("parseVhpReservationsToSegments", () => {
  it("aggregates by segment, excludes cancellations, and sums exactly", () => {
    const rows = parseVhpReservationsToSegments(SAMPLE_CSV);
    expect(rows).not.toBeNull();
    const byLabel = new Map(rows!.map((r) => [r.label, r]));

    // FIT-OTA: rows 1,2,3,4,6,9,11,12,14,16,17 (cancelled 5,7,8,13,15 excluded).
    // RN = 4+6+6+5+3+3+5+1+1+1+0 = 35
    // Rev = 21.6M+18.24228M+18.24228M+18.7373M+21.009449M+6.975M+16.533421M+3.11805M+2.421922M+1.976122M = 128,855,824
    expect(byLabel.get("FIT-OTA")).toEqual({ label: "FIT-OTA", rnSold: "35", grossRevenue: "128855824" });

    // FIT: rows 10,18 → RN 3+1 = 4, Rev 7,603,800 + 1,800,000 = 9,403,800
    expect(byLabel.get("FIT")).toEqual({ label: "FIT", rnSold: "4", grossRevenue: "9403800" });
  });

  it("sorts segments by revenue descending", () => {
    const rows = parseVhpReservationsToSegments(SAMPLE_CSV)!;
    expect(rows[0]!.label).toBe("FIT-OTA");
    expect(rows[1]!.label).toBe("FIT");
  });

  it("returns null for a non-reservation CSV (falls back to AI)", () => {
    expect(parseVhpReservationsToSegments("Segment,RN,Revenue\nOTA,10,5000000\n")).toBeNull();
    expect(parseVhpReservationsToSegments("just some text")).toBeNull();
  });
});
