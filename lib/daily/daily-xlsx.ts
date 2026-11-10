/**
 * Styled Excel export of the Daily Report, one workbook per property — attached
 * to the daily email and downloadable on demand. Built with ExcelJS so the file
 * carries the brand look (deep-teal header band, gold-highlighted summary rows,
 * borders, number formats) rather than plain cells. Each snapshot month is its
 * own tab in the team's "Daily Reservation Report" layout (snapshot dates down,
 * stay months across, the summary rows at the bottom); the latest month also
 * carries yesterday's pickup / cancellation / arrivals detail.
 */

import ExcelJS from "exceljs";

import { getPropertyDetail, type PropertyDetail } from "@/lib/daily/daily-detail-data";
import { getPickupReport, type PickupReport } from "@/lib/daily/pickup-report-data";
import { prisma } from "@/lib/prisma";

// Brand palette (ARGB).
const TEAL = "FF0F4C5C";
const WHITE = "FFFFFFFF";
const GOLD_SOFT = "FFFBEFCB"; // highlighted summary rows (Room Sold / Revenue Nett)
const TEAL_TINT = "FFEAF1F3"; // summary label column
const GREY_LINE = "FFD9D9D9";
const MUTED = "FF6B7280";

// Number formats (literal "%" — the stored value is already a percentage).
const PCT = '0.00"%"';
const SIGNED_PCT = '+0.00"%";-0.00"%";0.00"%"';
const INT = "#,##0";

const thin = { style: "thin" as const, color: { argb: GREY_LINE } };
const allBorders = { top: thin, left: thin, bottom: thin, right: thin };

function monthTabName(monthId: string): string {
  const [y, m] = monthId.split("-").map(Number);
  const short = new Date(Date.UTC(y!, (m ?? 1) - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return `${short} ${y}`;
}
function colLabel(stayYear: number, stayMonth: number): string {
  const short = new Date(Date.UTC(stayYear, stayMonth - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  return stayMonth === 1 ? `${short} '${String(stayYear).slice(2)}` : short;
}

/** Render one month's worksheet in the manual grid layout, styled. */
function renderMonthSheet(ws: ExcelJS.Worksheet, report: PickupReport, propertyName: string, detail: PropertyDetail | null): void {
  const nCols = report.columns.length;
  const width = nCols + 1; // label column + stay months
  const labels = report.columns.map((c) => colLabel(c.stayYear, c.stayMonth));

  ws.columns = [{ width: 26 }, ...report.columns.map(() => ({ width: 11 }))];

  // Title rows.
  ws.mergeCells(1, 1, 1, width);
  const t1 = ws.getCell(1, 1);
  t1.value = propertyName;
  t1.font = { bold: true, size: 14, color: { argb: TEAL } };
  ws.mergeCells(2, 1, 2, width);
  const t2 = ws.getCell(2, 1);
  t2.value = `${report.monthLabel} — Occupancy Pick-Up`;
  t2.font = { size: 10, color: { argb: MUTED } };

  // Header row (row 4).
  const headerRow = 4;
  const header = ws.getRow(headerRow);
  header.getCell(1).value = "Date";
  report.columns.forEach((_, i) => (header.getCell(i + 2).value = labels[i]!));
  for (let c = 1; c <= width; c++) {
    const cell = header.getCell(c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL } };
    cell.font = { bold: true, color: { argb: WHITE } };
    cell.alignment = { horizontal: c === 1 ? "left" : "right", vertical: "middle" };
    cell.border = allBorders;
  }
  header.height = 18;

  // Data rows.
  let r = headerRow + 1;
  for (const row of report.rows) {
    const xr = ws.getRow(r);
    xr.getCell(1).value = row.day;
    xr.getCell(1).alignment = { horizontal: "left" };
    xr.getCell(1).font = { color: { argb: MUTED } };
    xr.getCell(1).border = allBorders;
    row.cells.forEach((cell, i) => {
      const xc = xr.getCell(i + 2);
      if (cell && cell.occPct != null) {
        xc.value = cell.occPct;
        xc.numFmt = PCT;
      } else {
        xc.value = "—";
      }
      xc.alignment = { horizontal: "right" };
      xc.border = allBorders;
    });
    r += 1;
  }

  // Summary rows.
  const summary = (label: string, values: (number | null)[], opts: { numFmt: string; fill?: string; bold?: boolean }) => {
    const xr = ws.getRow(r);
    const lc = xr.getCell(1);
    lc.value = label;
    lc.font = { bold: true, color: { argb: "FF374151" } };
    lc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill ?? TEAL_TINT } };
    lc.border = allBorders;
    values.forEach((v, i) => {
      const xc = xr.getCell(i + 2);
      if (v == null) {
        xc.value = "—";
      } else {
        xc.value = v;
        xc.numFmt = opts.numFmt;
      }
      xc.alignment = { horizontal: "right" };
      xc.font = { bold: opts.bold ?? false };
      if (opts.fill) xc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
      xc.border = allBorders;
    });
    r += 1;
  };

  const s = report.summaries;
  summary("Average Pickup/day", s.map((x) => x.avgPickupPerDay), { numFmt: SIGNED_PCT });
  summary("Increasement %", s.map((x) => x.increasementPct), { numFmt: SIGNED_PCT });
  summary("Occ on Hand", s.map((x) => x.occOnHand), { numFmt: PCT, bold: true });
  summary("Room Sold", s.map((x) => x.roomSold), { numFmt: INT, fill: GOLD_SOFT, bold: true });
  summary("ADR", s.map((x) => (x.adr == null ? null : Math.round(x.adr))), { numFmt: INT });
  summary("Revenue Nett", s.map((x) => x.revenue), { numFmt: INT, fill: GOLD_SOFT, bold: true });

  if (!detail) return;

  // Yesterday's detail (latest month only).
  const heading = (text: string, sub?: string) => {
    r += 1;
    const xr = ws.getRow(r);
    const c = xr.getCell(1);
    c.value = text;
    c.font = { bold: true, color: { argb: TEAL } };
    if (sub) {
      const sc = xr.getCell(2);
      sc.value = sub;
      sc.font = { color: { argb: MUTED }, italic: true };
    }
    r += 1;
  };
  const kv = (label: string, value: string | number, indent = false) => {
    const xr = ws.getRow(r);
    xr.getCell(1).value = (indent ? "   " : "") + label;
    if (indent) xr.getCell(1).font = { color: { argb: MUTED } };
    xr.getCell(2).value = value;
    xr.getCell(2).alignment = { horizontal: "left" };
    r += 1;
  };

  heading("Yesterday's booking movement", detail.refDate ? `as of ${detail.refDate}` : undefined);
  kv("Yesterday pick up (RN)", detail.pickupTotal);
  kv("Yesterday cancellation (RN)", detail.cancelTotal);
  const onHand = detail.onHand.filter((h) => h.pct != null).map((h) => `${h.label} ${h.pct!.toFixed(2)}%`).join("   ");
  if (onHand) kv("On hand", onHand);
  kv(`Based on ${detail.roomCount} rooms`, "");

  const otaTotal = detail.pickupOtaOffline.reduce((a, b) => a + b.rn, 0);
  heading(`Pick up — OTA & Offline Agent (RN)`);
  ws.getRow(r - 1).getCell(2).value = otaTotal;
  for (const a of detail.pickupOtaOffline) kv(a.agent, `${a.rn} RN`, true);
  const directTotal = detail.pickupDirect.reduce((a, b) => a + b.rn, 0);
  heading(`Pick up — Direct (RN)`);
  ws.getRow(r - 1).getCell(2).value = directTotal;
  for (const a of detail.pickupDirect) kv(a.agent, `${a.rn} RN`, true);

  heading(`Cancellation — by agent (RN)`);
  ws.getRow(r - 1).getCell(2).value = detail.cancelTotal;
  if (detail.cancelByAgent.length === 0) kv("(none)", "", true);
  for (const a of detail.cancelByAgent) kv(a.agent, `${a.rn} RN`, true);

  heading("Arrivals & Departures");
  for (const f of detail.flow) kv(f.heading, `Arrival ${f.arrival ?? "—"} · Departure ${f.departure ?? "—"}`);
}

export interface PropertyWorkbook {
  code: string;
  filename: string;
  buffer: Buffer;
  months: number;
}

/** Build the styled Daily Report workbook for one property (newest month first). */
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
  const months = [...new Set(snaps.map((x) => x.snapshotDate.toISOString().slice(0, 7)))];

  const wb = new ExcelJS.Workbook();
  wb.creator = "Blue Karma Reporting";
  let written = 0;
  for (const [i, monthId] of months.entries()) {
    const report = await getPickupReport(prop.code, monthId);
    if (!report || report.columns.length === 0) continue;
    const detail = i === 0 ? await getPropertyDetail(prop.code) : null;
    const ws = wb.addWorksheet(monthTabName(monthId), { views: [{ state: "frozen", xSplit: 1, ySplit: 4 }] });
    renderMonthSheet(ws, report, prop.name, detail);
    written += 1;
  }

  if (written === 0) {
    const ws = wb.addWorksheet("Daily Report");
    ws.getCell(1, 1).value = prop.name;
    ws.getCell(1, 1).font = { bold: true, color: { argb: TEAL } };
    ws.getCell(2, 1).value = "No daily occupancy data has been recorded yet.";
  }

  const year = months[0]?.slice(0, 4) ?? String(new Date().getUTCFullYear());
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
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
