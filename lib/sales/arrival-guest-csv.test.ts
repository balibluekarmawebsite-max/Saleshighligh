import { describe, expect, it } from "vitest";

import { parseArrivalGuestCsv, parseCsv } from "@/lib/sales/arrival-guest-csv";
import { resolveCountry } from "@/lib/sales/countries";
import { compileGuestArrivals } from "@/lib/sales/guest-arrivals-logic";

describe("resolveCountry — alpha-3 (VHP) codes", () => {
  it("resolves ISO alpha-3", () => {
    expect(resolveCountry("AUS")).toEqual({ code: "AU", name: "Australia" });
    expect(resolveCountry("FRA").code).toBe("FR");
    expect(resolveCountry("CHN").code).toBe("CN");
    expect(resolveCountry("GBR").code).toBe("GB");
    expect(resolveCountry("DEU").code).toBe("DE");
    expect(resolveCountry("KOR").code).toBe("KR");
  });
  it("resolves VHP's non-ISO INA → Indonesia and other IOC codes", () => {
    expect(resolveCountry("INA")).toEqual({ code: "ID", name: "Indonesia" });
    expect(resolveCountry("SUI").code).toBe("CH");
    expect(resolveCountry("GER").code).toBe("DE");
  });
  it("still handles alpha-2 and names", () => {
    expect(resolveCountry("AU").code).toBe("AU");
    expect(resolveCountry("Australia").code).toBe("AU");
  });
});

// A miniature of the real VHP export: preamble, a header row, two data rows
// (one with an embedded comma + quote in Remark), and a cancelled row.
const SAMPLE = `BALI BLUE KARMA,,,,,,,,,,,,,Date: 11/11/2026
Jl. Seminyak Gang Bima,,,,,,,,,,,,,
Tel +62,,,,,,,,,,,,,Period: Period: 01/10/26 - 31/10/26
,,,,,,,,,,,,,
Arrival Guest Report,,,,,,,,,,,,,

"No","Room Number","Reservation Number","Group Name","Repeater Guest","Guest Name","VIP","Arrangement","Room Type","Room Rate","Adult / Child","Compliment","Nationality","Date Of Birth","Company / Agent Name","Arrival","Departure","Reservation Status","Flight","Time","Stay","No of Visit","Email","Mobile Phone","Created Date","Created By","Remark","actions"
"1","GIN","20926","","","Evans, Mark MR","","BB24","1BSUI","2,275,000.00","2/0","0","AUS","1969-07-21","ALARIC","01/10/26","05/10/26","Departed","","0000","4","1","a@b.com","","02/11/25","**","note, with ""quotes"" and, commas",""
"2","LAV","23685","","","Kaan MRS","","BB24","1BPVL","3,253,162.00","2/1","0","INA","1972-06-12","Booking.com","01/10/26","03/10/26","Departed","","0000","2","0","c@d.com","","14/09/26","**","simple",""
"3","MUS","23395","","","X","","BB24","1BSUI","1,000.00","1/0","0","FRA","1992-01-10","Agoda","01/10/26","02/10/26","Cancelled","","0000","1","1","e@f.com","","07/08/26","**","cancelled row",""`;

describe("parseCsv", () => {
  it("handles quoted fields with embedded commas and escaped quotes", () => {
    const rows = parseCsv(`a,"b,c","he said ""hi""",d`);
    expect(rows[0]).toEqual(["a", "b,c", 'he said "hi"', "d"]);
  });
  it("handles embedded newlines inside quotes", () => {
    const rows = parseCsv(`"line1\nline2",x`);
    expect(rows).toHaveLength(1);
    expect(rows[0]![0]).toBe("line1\nline2");
  });
});

describe("parseArrivalGuestCsv", () => {
  it("detects the period + property and extracts arrivals, dropping cancelled rows", () => {
    const r = parseArrivalGuestCsv(SAMPLE);
    expect(r.meta.headerFound).toBe(true);
    expect(r.meta.periodHint).toBe("2026-10");
    expect(r.meta.propertyHint).toBe("BKDS");
    expect(r.meta.rowCount).toBe(2); // the cancelled FRA row is skipped
    expect(r.meta.skipped).toBe(1);

    // Fields parsed: AUS, 4 nights, 2 guests; INA, 2 nights, 3 guests.
    const aus = r.arrivals.find((a) => a.country === "AUS")!;
    expect(aus.nights).toBe(4);
    expect(aus.guests).toBe(2);
    expect(aus.arrival).toBe("2026-10-01");
    const ina = r.arrivals.find((a) => a.country === "INA")!;
    expect(ina.guests).toBe(3); // 2/1
  });

  it("compiles the parsed rows into resolved nationalities + LOS", () => {
    const { arrivals } = parseArrivalGuestCsv(SAMPLE);
    const c = compileGuestArrivals(arrivals);
    const byCode = Object.fromEntries(c.nationality.map((n) => [n.countryCode, n]));
    expect(byCode["AU"]!.roomNights).toBe(4);
    expect(byCode["ID"]!.countryName).toBe("Indonesia"); // INA resolved
    expect(c.totals.arrivals).toBe(2);
    // LOS buckets 4 and 2 each have one booking.
    expect(c.los.map((l) => l.losBucket).sort()).toEqual(["2", "4"]);
  });
});
