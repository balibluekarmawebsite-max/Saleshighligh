import { describe, expect, it } from "vitest";

import {
  cancellationRoomNights,
  cancellationRoomNightsByDate,
  isSameDayCancellation,
  sameDayCancellationRoomNights,
} from "@/lib/daily/calculations";
import { parseCancellationReport, vhpDateToIso } from "@/lib/daily/parse-cancellation";

// A faithful slice of the real VHP "Cancellation Report" export: two blank lead
// rows, the header, 11 data lines (one of which — res 9505 — is cancelled on the
// same date it was created), then the TOTAL row.
const SAMPLE = `
"","","","","","","","","","","","","","","","","","","","","",""
"Reservation Number","Column Number","Room Number","Guest Name","Reservation Name","Arrival","Night","Departure","Room Quantity","Room Type","Adult","Child","Compliment","Arrangement Code","Room Rate","Cancel Date","Cancel Time","Cancelled Id","Created Date","Reservation Status","Cancel Reason","Voucher"
"9443","0","","Fecht, Tania ","BOOKING.COM  ","27/10/26","6","02/11/26","1","1BDSUI","2","0","0","BB24","3,592,478.00","18/10/26","15:10:57","**","11/10/26","Guaranteed","Cancelled by BookEngine","5327646589"
"9440","0","","Jorge Machado, Paulo ","EXPEDIA ","27/01/27","4","31/01/27","1","1BDSUI","2","0","0","BB24","2,747,277.00","18/10/26","19:09:25","**","10/10/26","Guaranteed","Cancelled by BookEngine","2578548064"
"9438","0","","Jorge Machado, Paulo ","MG HOLIDAY , ","27/01/27","4","31/01/27","1","1BDSUI","2","0","0","BB24","2,199,999.84","18/10/26","19:09:21","**","10/10/26","Guaranteed","Cancelled by BookEngine","AGTH0259312610392979"
"9446","0","","Jorge Machado, Paulo ","MG HOLIDAY , ","27/01/27","4","31/01/27","1","1BDSUI","2","0","0","BB24","2,199,999.84","18/10/26","19:09:28","**","11/10/26","Guaranteed","Cancelled by BookEngine","AGCN5331672610398555"
"8150","0","","Lust, justine ","BOOKING.COM  ","21/10/26","1","22/10/26","1","1BDSUI","2","0","0","BB24","3,323,320.00","18/10/26","00:06:42","**","13/05/26","Guaranteed","Cancelled by BookEngine","6120641600"
"9276","0","","Marcinova-, Simona ","BOOKING.COM  ","24/11/26","4","28/11/26","1","2BVSD","3","0","0","BB24","4,799,337.00","18/10/26","18:49:09","**","22/09/26","Guaranteed","Cancelled by BookEngine","6738944857"
"9478","0","","Mclaine, Lauren ","BOOKING.COM  ","04/10/27","5","09/10/27","1","DLXJOC","1","3","0","BB24","2,096,688.00","18/10/26","14:15:10","**","16/10/26","Guaranteed","Cancelled by BookEngine","6439995859"
"9478","0","","Mclaine, Lauren ","BOOKING.COM  ","04/10/27","5","09/10/27","1","1BDPVL","1","0","0","BB24","3,769,524.00","18/10/26","14:15:10","**","16/10/26","Guaranteed","Cancelled by BookEngine","6439995859"
"9478","0","","Mclaine, Lauren ","BOOKING.COM  ","04/10/27","5","09/10/27","1","2BVSD","1","3","0","BB24","4,193,376.00","18/10/26","14:15:10","**","16/10/26","Guaranteed","Cancelled by BookEngine","6439995859"
"9505","0","","Nicholas, Andrew ","BOOKING.COM  ","17/06/27","2","19/06/27","1","1BDSUI","2","0","0","BB24","4,472,417.00","18/10/26","15:46:03","**","18/10/26","Guaranteed","Cancelled by BookEngine","6470978742"
"9483","0","","[INDIVIDUAL RESERVATION],  ","[INDIVIDUAL RESERVATION], ","20/10/26","8","28/10/26","1","1BDSUI","0","0","2","COMP","0.00","18/10/26","16:27:33","14","16/10/26","Guaranteed","Cancelled by Booker"," "
"TOTAL","","","ROOM: 11","","","NIGHT: 48","","","","ADULT: 18","","","","CHILD: 6","","","","COMPLIMENT: 2","","",""
`;

describe("vhpDateToIso", () => {
  it("parses DD/MM/YY with a 2-digit year", () => {
    expect(vhpDateToIso("18/10/26")).toBe("2026-10-18");
    expect(vhpDateToIso("04/10/27")).toBe("2027-10-04");
    expect(vhpDateToIso("13/05/26")).toBe("2026-05-13");
  });
  it("parses DD/MM/YYYY", () => {
    expect(vhpDateToIso("01/02/2026")).toBe("2026-02-01");
  });
  it("rejects blanks, junk and impossible dates", () => {
    expect(vhpDateToIso("")).toBeNull();
    expect(vhpDateToIso("NIGHT: 48")).toBeNull();
    expect(vhpDateToIso("31/02/26")).toBeNull();
    expect(vhpDateToIso("00/10/26")).toBeNull();
  });
});

describe("parseCancellationReport", () => {
  const rows = parseCancellationReport(SAMPLE)!;

  it("parses the 11 data lines, skipping blanks and the TOTAL row", () => {
    expect(rows).not.toBeNull();
    expect(rows).toHaveLength(11);
  });

  it("reads the first line's fields", () => {
    expect(rows[0]).toMatchObject({
      cancelDate: "2026-10-18",
      createdDate: "2026-10-11",
      nights: 6,
      roomQuantity: 1,
      reservationNumber: "9443",
      reservationName: "BOOKING.COM",
      arrivalDate: "2026-10-27",
      departureDate: "2026-11-02",
      roomType: "1BDSUI",
      roomRate: 3592478,
    });
  });

  it("normalises the agent name (before the comma, no asterisks)", () => {
    const mg = rows.find((r) => r.reservationNumber === "9438");
    expect(mg?.reservationName).toBe("MG HOLIDAY");
    const ind = rows.find((r) => r.reservationNumber === "9483");
    expect(ind?.reservationName).toBe("[INDIVIDUAL RESERVATION]");
  });

  it("returns null for text that isn't a cancellation report", () => {
    expect(parseCancellationReport("a,b,c\n1,2,3")).toBeNull();
  });
});

describe("cancellation room-night calculations (same-day excluded)", () => {
  const rows = parseCancellationReport(SAMPLE)!;

  it("flags the same-day book-and-cancel line (res 9505)", () => {
    const sameDay = rows.filter(isSameDayCancellation);
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0]!.reservationNumber).toBe("9505");
  });

  it("counts 46 room nights (raw 48 minus the 2 same-day nights)", () => {
    // Raw total of the Night column matches the sheet's TOTAL (NIGHT: 48).
    const rawTotal = rows.reduce((s, r) => s + r.nights * r.roomQuantity, 0);
    expect(rawTotal).toBe(48);
    expect(cancellationRoomNights(rows)).toBe(46);
    expect(sameDayCancellationRoomNights(rows)).toBe(2);
  });

  it("groups counted room nights by cancel date", () => {
    const byDate = cancellationRoomNightsByDate(rows);
    expect(byDate.get("2026-10-18")).toBe(46);
    expect(byDate.size).toBe(1);
  });
});
