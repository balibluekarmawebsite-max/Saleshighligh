/**
 * Excel export of the Daily Report, one workbook per property — attached to the
 * daily email and downloadable on demand. Each snapshot month is its own tab, in
 * the team's manual "Daily Reservation Report" layout (snapshot dates down, stay
 * months across, the yellow summary rows at the bottom). The latest month also
 * carries yesterday's pickup / cancellation / arrivals detail; the older month
 * tabs are the historical record.
 */

import * as XLSX from "xlsx";

import { getPropertyDetail, type PropertyDetail } from "@/lib/daily/daily-detail-data";
import { getPickupReport, type PickupReport } from "@/lib/daily/pickup-report-data";
import { prisma } from "@/lib/prisma";

type Cell = string | number | null;

// Custom number formats (literal "%" — the stored value is already a percentage,
// so we don't want Excel to multiply by 100).
const PCT = '0.00"%"';
const SIGNED_PCT = '+0.00"%";-0.00"%";0.00"%"';
const INT = "#,##0";

function setFmt(ws: XLSX.WorkSheet, r: number, c: number, z: string): void {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr] as XLSX.CellObject | undefined;
  if (cell && cell.t === "n") cell.z = z;
}

function monthTabName(monthId: string): string {
  const [y, m] = monthId.split("-").map(Number);
  const short = new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${short} ${y}`; // "Nov 2026" — valid, <=31 chars, unique per month
}

function colLabel(stayYear: number, stayMonth: number): string {
  const short = new Date(Date.UTC(stayYear, stayMonth - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return stayMonth === 1 ? `${short} '${String(stayYear).slice(2)}` : short;
}

/** Build one month's worksheet in the manual grid layout (+ optional detail). */
function monthSheet(report: PickupReport, propertyName: string, detail: PropertyDetail | null): XLSX.WorkSheet {
  const nCols = report.columns.length;
  const labels = report.columns.map((c) => colLabel(c.stayYear, c.stayMonth));
  const rows: Cell[][] = [];

  rows.push([propertyName]);
  rows.push([`${report.monthLabel} — Occupancy Pick-Up`]);
  rows.push([]);

  rows.push(["Date", ...labels]);
  const dataStart = rows.length;
  for (const r of report.rows) {
    rows.push([r.day, ...r.cells.map((c) => (c ? c.occPct : null))]);
  }
  const dataEnd = rows.length - 1;

  rows.push([]);
  const avgIdx = rows.length; rows.push(["Average Pickup/day", ...report.summaries.map((s) => s.avgPickupPerDay)]);
  const incIdx = rows.length; rows.push(["Increasement %", ...report.summaries.map((s) => s.increasementPct)]);
  const occIdx = rows.length; rows.push(["Occ on Hand", ...report.summaries.map((s) => s.occOnHand)]);
  const soldIdx = rows.length; rows.push(["Room Sold", ...report.summaries.map((s) => s.roomSold)]);
  const adrIdx = rows.length; rows.push(["ADR", ...report.summaries.map((s) => (s.adr == null ? null : Math.round(s.adr)))]);
  const revIdx = rows.length; rows.push(["Revenue Nett", ...report.summaries.map((s) => s.revenue)]);

  // Yesterday's detail — only on the latest month's tab.
  if (detail) {
    rows.push([], []);
    rows.push(["Yesterday's booking movement", detail.refDate ? `as of ${detail.refDate}` : ""]);
    rows.push(["Yesterday pick up (RN)", detail.pickupTotal]);
    rows.push(["Yesterday cancellation (RN)", detail.cancelTotal]);
    rows.push([]);
    rows.push(["On hand", ...detail.onHand.map((h) => (h.pct == null ? null : `${h.label} ${h.pct.toFixed(2)}%`))]);
    rows.push([`Based on ${detail.roomCount} rooms`]);
    rows.push([]);
    const otaTotal = detail.pickupOtaOffline.reduce((s, a) => s + a.rn, 0);
    rows.push([`Pick up — OTA & Offline Agent (RN)`, otaTotal]);
    for (const a of detail.pickupOtaOffline) rows.push([`   ${a.agent}`, a.rn]);
    const directTotal = detail.pickupDirect.reduce((s, a) => s + a.rn, 0);
    rows.push([`Pick up — Direct (RN)`, directTotal]);
    for (const a of detail.pickupDirect) rows.push([`   ${a.agent}`, a.rn]);
    rows.push([]);
    rows.push([`Cancellation — by agent (RN)`, detail.cancelTotal]);
    if (detail.cancelByAgent.length === 0) rows.push(["   (none)"]);
    for (const a of detail.cancelByAgent) rows.push([`   ${a.agent}`, a.rn]);
    rows.push([]);
    rows.push(["Arrivals & Departures", "Arrival (rooms)", "Departure (rooms)"]);
    for (const f of detail.flow) rows.push([f.heading, f.arrival, f.departure]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Number formats on the grid + summary rows.
  for (let r = dataStart; r <= dataEnd; r++) for (let c = 1; c <= nCols; c++) setFmt(ws, r, c, PCT);
  for (let c = 1; c <= nCols; c++) {
    setFmt(ws, avgIdx, c, SIGNED_PCT);
    setFmt(ws, incIdx, c, SIGNED_PCT);
    setFmt(ws, occIdx, c, PCT);
    setFmt(ws, soldIdx, c, INT);
    setFmt(ws, adrIdx, c, INT);
    setFmt(ws, revIdx, c, INT);
  }

  ws["!cols"] = [{ wch: 26 }, ...report.columns.map(() => ({ wch: 11 }))];
  return ws;
}

export interface PropertyWorkbook {
  code: string;
  filename: string;
  buffer: Buffer;
  months: number; // tabs written
}

/**
 * Build the Daily Report workbook for one property (newest month first, older
 * months as history). Returns null for an unknown property. Always returns a
 * workbook with at least a placeholder sheet so the email attachment is valid
 * even before any data lands.
 */
export async function buildPropertyWorkbook(propertyCode: string): Promise<PropertyWorkbook | null> {
  const code = propertyCode.trim().toUpperCase();
  const prop = await prisma.property.findUnique({ where: { code }, select: { id: true, code: true, name: true } });
  if (!prop) return null;

  const snaps = await prisma.dailyPickupSnapshot.findMany({
    where: { propertyId: prop.id },
    distinct: ["snapshotDate"],
    select: { snapshotDate: true },
    orderBy: { snapshotDate: "desc" },
  });
  const months = [...new Set(snaps.map((s) => s.snapshotDate.toISOString().slice(0, 7)))]; // yyyy-mm, newest first

  const wb = XLSX.utils.book_new();
  let written = 0;
  for (const [i, monthId] of months.entries()) {
    const report = await getPickupReport(prop.code, monthId);
    if (!report || report.columns.length === 0) continue;
    const detail = i === 0 ? await getPropertyDetail(prop.code) : null;
    XLSX.utils.book_append_sheet(wb, monthSheet(report, prop.name, detail), monthTabName(monthId));
    written += 1;
  }

  if (written === 0) {
    const ws = XLSX.utils.aoa_to_sheet([
      [prop.name],
      ["No daily occupancy data has been recorded yet."],
      ["The scraper posts the Yearly Occupancy export once a day; each push adds a row."],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, "Daily Report");
  }

  const year = months[0]?.slice(0, 4) ?? String(new Date().getUTCFullYear());
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { code: prop.code, filename: `Daily Reservation Report ${prop.code} ${year}.xlsx`, buffer, months: written };
}

/** Build a workbook for every property (BKDS, BKDU, BKV …) for the email. */
export async function buildAllWorkbooks(): Promise<PropertyWorkbook[]> {
  const props = await prisma.property.findMany({ select: { code: true }, orderBy: { code: "asc" } });
  const out: PropertyWorkbook[] = [];
  for (const p of props) {
    const wb = await buildPropertyWorkbook(p.code);
    if (wb) out.push(wb);
  }
  return out;
}
