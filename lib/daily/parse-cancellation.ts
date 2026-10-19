/**
 * Deterministic parser for the VHP "Cancellation Report" CSV (feed `CANCEL`).
 *
 * One RAW row per cancelled reservation line. The file has a couple of blank
 * lead rows, a header row (Reservation Number … Cancel Date, Created Date, …),
 * the data rows, then a `TOTAL` row — all fully quoted. Dates are `DD/MM/YY`.
 *
 * We DON'T apply the daily report's "exclude same-day book-and-cancel" rule here
 * — both dates are kept raw so the exclusion stays a calculation
 * (lib/daily/calculations.ts), changeable without re-importing.
 */

import { parseCsv } from "@/lib/weekly/import/vhp-parse";

export interface CancellationRow {
  /** Business/transaction date the reservation was cancelled (ISO yyyy-mm-dd). */
  cancelDate: string;
  /** Date the reservation was originally created (ISO yyyy-mm-dd). */
  createdDate: string;
  /** Room nights cancelled on this line. */
  nights: number;
  roomQuantity: number;
  reservationNumber: string | null;
  /** Booking agent / source (BOOKING.COM, EXPEDIA, MG HOLIDAY, …). */
  reservationName: string | null;
  guestName: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  roomType: string | null;
  roomRate: number | null;
  cancelReason: string | null;
}

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

function toInt(s: string | undefined): number {
  const n = parseInt((s ?? "").replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

function toMoney(s: string | undefined): number | null {
  const t = (s ?? "").replace(/[,\s"]/g, "");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function cleanText(s: string | undefined): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/** Agent / source label: part before the first comma, asterisks stripped. */
function cleanAgent(s: string | undefined): string | null {
  const t = (s ?? "").split(",")[0]!.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

/** VHP date "DD/MM/YY" (or DD/MM/YYYY) → ISO `yyyy-mm-dd`, or null if invalid. */
export function vhpDateToIso(s: string | undefined): string | null {
  const m = (s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);
  if (year < 100) year += 2000; // "26" → 2026
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00.000Z`);
  // Reject impossible dates (e.g. 31/02) — round-trip check.
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== day || d.getUTCMonth() + 1 !== month) return null;
  return iso;
}

/**
 * Parse a VHP Cancellation Report CSV into raw cancellation lines. Returns null
 * if the text isn't that report (no recognised header). Rows without a valid
 * cancel + created date are skipped — this drops the blank lead rows and the
 * trailing `TOTAL` row in one go.
 */
export function parseCancellationReport(text: string): CancellationRow[] | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;

  const headerIdx = rows.findIndex((r) => {
    const set = new Set(r.map(norm));
    return set.has("cancel date") && set.has("created date") && set.has("night") && set.has("reservation name");
  });
  if (headerIdx < 0) return null;

  const header = rows[headerIdx]!.map(norm);
  const col = (name: string) => header.indexOf(name);
  const iResNo = col("reservation number");
  const iResName = col("reservation name");
  const iGuest = col("guest name");
  const iArrival = col("arrival");
  const iNight = col("night");
  const iDeparture = col("departure");
  const iQty = col("room quantity");
  const iRoomType = col("room type");
  const iRate = col("room rate");
  const iCancelDate = col("cancel date");
  const iCreatedDate = col("created date");
  const iReason = col("cancel reason");
  if (iCancelDate < 0 || iCreatedDate < 0 || iNight < 0 || iResName < 0) return null;

  const out: CancellationRow[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]!;
    const cancelDate = vhpDateToIso(r[iCancelDate]);
    const createdDate = vhpDateToIso(r[iCreatedDate]);
    if (!cancelDate || !createdDate) continue; // skips blanks + the TOTAL row

    out.push({
      cancelDate,
      createdDate,
      nights: toInt(r[iNight]),
      roomQuantity: iQty >= 0 ? toInt(r[iQty]) || 1 : 1,
      reservationNumber: iResNo >= 0 ? cleanText(r[iResNo]) : null,
      reservationName: cleanAgent(r[iResName]),
      guestName: iGuest >= 0 ? cleanText(r[iGuest]) : null,
      arrivalDate: iArrival >= 0 ? vhpDateToIso(r[iArrival]) : null,
      departureDate: iDeparture >= 0 ? vhpDateToIso(r[iDeparture]) : null,
      roomType: iRoomType >= 0 ? cleanText(r[iRoomType]) : null,
      roomRate: iRate >= 0 ? toMoney(r[iRate]) : null,
      cancelReason: iReason >= 0 ? cleanText(r[iReason]) : null,
    });
  }

  return out.length > 0 ? out : null;
}
