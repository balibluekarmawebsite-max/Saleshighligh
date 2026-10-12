/**
 * Deterministic parsers for known VHP CSV exports.
 *
 * The VHP "Reservation By Creation Date" export is a RAW list — one row per
 * room booking, with report-title lines at the top and fully-quoted CSV. For
 * Section C (agent / source production) the dashboard needs it AGGREGATED by
 * the booking agent — i.e. the "Reservation Name" column (Booking.com, Expedia,
 * Agoda, individual reservations, …). Doing that in code is instant and exact
 * (it reads the whole file and sums precisely), unlike the AI path which
 * truncates large inputs and so can under-count. The token push tries this
 * first and falls back to the AI only when the file isn't a recognised VHP
 * layout.
 *
 * Business rules (Section C):
 *   • group by the "Reservation Name" column (the booking agent / source),
 *     normalised to the part before the first comma, asterisks stripped;
 *   • room nights  = Night × Room Quantity, summed;
 *   • revenue      = sum of "Total Revenue";
 *   • exclude rows whose Status is Cancelled / No-show (not production);
 *   • only count numbered data rows (skips titles, repeated headers, totals).
 */

import type { ImportRow } from "@/lib/weekly/import/apply-core";
import type { ExtractFile } from "@/lib/weekly/import/extract";

/** Parse CSV text (RFC-4180-ish: quoted fields, embedded commas/quotes/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let sawField = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
      sawField = true;
    } else if (c === ",") {
      row.push(field); field = ""; sawField = true;
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = ""; sawField = false;
    } else if (c !== "\r") {
      field += c; sawField = true;
    }
  }
  if (sawField || field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

/** Money like "21,600,000.00" → 21600000 (null-safe, 0 on junk). */
function toMoney(s: string | undefined): number {
  const n = Number((s ?? "").replace(/[,\s"]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
/** Integer like "6" → 6 (0 on junk). */
function toInt(s: string | undefined): number {
  const n = parseInt((s ?? "").replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normalise a VHP "Reservation Name" into a booking agent / source label:
 *   • take the part BEFORE the first comma — the agent name (anything after is a
 *     booker/contact suffix, e.g. "Booking.com, T&T" → "Booking.com");
 *   • strip asterisks — "***INDIVIDUAL RESERVATION***" → "INDIVIDUAL RESERVATION";
 *   • collapse internal whitespace and trim.
 */
function normAgent(s: string | undefined): string {
  return (s ?? "")
    .split(",")[0]!
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Aggregate a VHP "Reservation By Creation Date" CSV into Section C rows,
 * grouped by the booking AGENT / SOURCE (the "Reservation Name" column) —
 * Booking.com, Expedia, Agoda, individual reservations, etc. Returns null if
 * the text isn't that report (so the caller falls back to the AI extractor).
 */
export function parseVhpReservationsByAgent(text: string): ImportRow[] | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;

  // Find the column header row (the real one, below the report title lines).
  const headerIdx = rows.findIndex((r) => {
    const set = new Set(r.map(norm));
    return set.has("reservation name") && set.has("total revenue") && set.has("night");
  });
  if (headerIdx < 0) return null;

  const header = rows[headerIdx]!.map(norm);
  const col = (name: string) => header.indexOf(name);
  const iNo = col("no");
  const iName = col("reservation name");
  const iNight = col("night");
  const iQty = col("room quantity");
  const iRev = col("total revenue");
  const iStatus = col("status");
  if (iName < 0 || iNight < 0 || iRev < 0) return null;

  const agg = new Map<string, { rn: number; rev: number }>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]!;
    // Data rows are numbered 1,2,3…; this skips titles, repeated headers,
    // page breaks and totals rows in one go.
    if (iNo >= 0 && toInt(r[iNo]) <= 0) continue;
    const agent = normAgent(r[iName]);
    if (!agent) continue;
    const status = norm(r[iStatus]);
    if (status.includes("cancel") || status.includes("no show") || status.includes("noshow")) continue;

    const nights = toInt(r[iNight]);
    const qty = iQty >= 0 ? toInt(r[iQty]) : 1;
    const cur = agg.get(agent) ?? { rn: 0, rev: 0 };
    cur.rn += nights * qty; // room-nights = nights × rooms (0 for cancelled/companion lines)
    cur.rev += toMoney(r[iRev]);
    agg.set(agent, cur);
  }

  if (agg.size === 0) return null;
  return [...agg.entries()]
    .map(([label, v]) => ({ label, rnSold: String(v.rn), grossRevenue: String(v.rev) }))
    .sort((a, b) => Number(b.grossRevenue) - Number(a.grossRevenue));
}

const MONTH_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
/** Pull a month number from a label like "01/10 Oct " or "Oct ". */
function monthFromLabel(s: string | undefined): number | null {
  const m = (s ?? "").toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/);
  return m ? MONTH_NUM[m[1]!]! : null;
}

/**
 * Parse a VHP "Yearly Forecast Of Room Occupancy" CSV into Section B monthly
 * rows. Uses ONLY the monthly summary rows — "Room Occupied" (= RN sold),
 * "Occupancy (%)", and "Room Revenue" — ignoring the daily grid. ADR is
 * derived (revenue ÷ room-nights).
 *
 * The 12 columns run from the report month forward (e.g. Oct → Sep), so a
 * column can fall in the next calendar year. Only columns in `reportYear` are
 * written (so an October report fills Oct/Nov/Dec and leaves the Jan–Sep
 * columns, which belong to the following year, alone). Returns null if the
 * text isn't that report.
 */
export function parseVhpForecastToMonthly(text: string, reportYear: number): ImportRow[] | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;

  // Daily-grid header: cell 0 is "Date" and the rest are month-labelled columns.
  const header = rows.find((r) => norm(r[0]) === "date" && r.slice(1).some((c) => monthFromLabel(c) != null));
  if (!header) return null;
  const monthCols = header
    .map((c, i) => ({ month: i === 0 ? null : monthFromLabel(c), col: i }))
    .filter((x): x is { month: number; col: number } => x.month != null);
  if (monthCols.length === 0) return null;
  const startMonth = monthCols[0]!.month;

  const findRow = (label: string) => rows.find((r) => norm(r[0]) === label);
  const roomOcc = findRow("room occupied");
  const occPct = findRow("occupancy (%)");
  if (!roomOcc || !occPct) return null;

  // Revenue: each "Period" header names its months; the next "Room Revenue"
  // row carries the values, aligned by column.
  const revenueByMonth = new Map<number, number>();
  for (let i = 0; i < rows.length; i++) {
    if (norm(rows[i]![0]) !== "period") continue;
    const revRow = rows.slice(i + 1).find((r) => norm(r[0]) === "room revenue");
    if (!revRow) continue;
    rows[i]!.forEach((c, idx) => {
      if (idx === 0) return;
      const m = monthFromLabel(c);
      if (m == null) return;
      const v = toMoney(revRow[idx]);
      if (v > 0) revenueByMonth.set(m, v);
    });
  }

  const out: ImportRow[] = [];
  for (const { month, col } of monthCols) {
    // Consecutive months from the start → which calendar year this column is in.
    const offset = (month - startMonth + 12) % 12;
    const year = reportYear + Math.floor((startMonth - 1 + offset) / 12);
    if (year !== reportYear) continue; // keep only this report year's months

    const rn = Math.round(toMoney(roomOcc[col]));
    const occ = toMoney(occPct[col]);
    const rev = revenueByMonth.get(month) ?? 0;
    if (rn === 0 && occ === 0 && rev === 0) continue;

    const row: ImportRow = { month: String(month) };
    if (rn > 0) row.rnSold = String(rn);
    if (occ > 0) row.occActual = String(occ);
    if (rev > 0) {
      row.revActual = String(rev);
      if (rn > 0) row.arrActual = String(Math.round(rev / rn));
    }
    out.push(row);
  }

  return out.length > 0 ? out : null;
}

/**
 * Try a deterministic parse for a known VHP CSV export. Returns rows on a
 * confident match, or null to fall back to the AI extractor. Only CSV/text
 * files are attempted (xlsx and unknown layouts fall through to AI).
 */
export function tryVhpParse(sectionId: string, file: ExtractFile, reportYear: number): ImportRow[] | null {
  if (/\.(xlsx|xls)$/i.test(file.filename)) return null;
  const type = (file.type || "").toLowerCase();
  const looksText =
    /\.csv$/i.test(file.filename) || type.includes("csv") || type.includes("text") || type === "" || type.includes("octet-stream");
  if (!looksText) return null;

  let text: string;
  try {
    text = file.buffer.toString("utf8");
  } catch {
    return null;
  }

  if (sectionId === "segment") return parseVhpReservationsByAgent(text);
  if (sectionId === "monthly") return parseVhpForecastToMonthly(text, reportYear);
  return null;
}
