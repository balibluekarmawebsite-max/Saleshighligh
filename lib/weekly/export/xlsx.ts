/**
 * Styled Excel export for the weekly report (exceljs).
 *
 * Produces a clean, management-ready workbook: a Cover sheet, one sheet per
 * report section, deep-teal headers with white bold text, a gold title accent,
 * cream total rows, merged two-row group headers (Section B), IDR thousand
 * separators and 1-dp percentages, per-year channel blocks, and an Owner
 * Overview sheet. Mirrors the clarity of the legacy weekly-report export.
 */

import ExcelJS from "exceljs";

import { screenshotCategoryLabel } from "@/lib/weekly/screenshots";
import type {
  WeeklyExportData,
  WeeklyProductionRow,
} from "@/lib/weekly/export-data";

// Brand palette (ARGB).
const TEAL = "FF0F4C5C";
const GOLD = "FFC9A227";
const CREAM = "FFF5F1E6";
const WHITE = "FFFFFFFF";
const INK = "FF1F2937";
const GREY = "FF6B7280";
const LINE = "FFE5E7EB";

// Number formats.
const MONEY = "#,##0";
const NUM = "#,##0";
const NUMRED = "#,##0;[Red]-#,##0";
const PCT = "0.0%";
const PCTRED = "0.0%;[Red]-0.0%";

const FONT = "Calibri";
const HAIR = { style: "thin" as const, color: { argb: LINE } };

type Align = "L" | "R" | "C";
interface Col {
  h: string;
  w: number;
  a: Align;
  f?: string;
}
type Cell = string | number | null;

const hAlign = (a: Align) => (a === "L" ? "left" : a === "C" ? "center" : "right");

/** Whole-percent (e.g. 35.2) → fraction for a 0.0% cell; null-safe. */
const pc = (v: number | null | undefined): number | null => (v == null ? null : v / 100);

function fill(cell: ExcelJS.Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function headerCell(cell: ExcelJS.Cell, a: Align) {
  cell.font = { name: FONT, bold: true, size: 11, color: { argb: WHITE } };
  fill(cell, TEAL);
  cell.alignment = { vertical: "middle", horizontal: hAlign(a), wrapText: true };
  cell.border = { top: HAIR, left: HAIR, bottom: HAIR, right: HAIR };
}

function dataCell(cell: ExcelJS.Cell, col: Col) {
  cell.font = { name: FONT, size: 11, color: { argb: INK } };
  cell.alignment = { vertical: "top", horizontal: hAlign(col.a), wrapText: col.a === "L" };
  if (col.f) cell.numFmt = col.f;
  cell.border = { bottom: HAIR };
}

function totalCell(cell: ExcelJS.Cell, col: Col) {
  cell.font = { name: FONT, bold: true, size: 11, color: { argb: INK } };
  fill(cell, CREAM);
  cell.alignment = { vertical: "middle", horizontal: hAlign(col.a) };
  if (col.f) cell.numFmt = col.f;
  cell.border = { top: { style: "medium", color: { argb: TEAL } } };
}

/** A section title row (teal, bold), merged across `span` columns. */
function titleRow(ws: ExcelJS.Worksheet, text: string, span: number, size = 14): number {
  const row = ws.addRow([text]);
  row.getCell(1).font = { name: FONT, bold: true, size, color: { argb: TEAL } };
  row.height = size + 8;
  if (span > 1) ws.mergeCells(row.number, 1, row.number, span);
  return row.number;
}

function subtitleRow(ws: ExcelJS.Worksheet, text: string, span: number): number {
  const row = ws.addRow([text]);
  row.getCell(1).font = { name: FONT, italic: true, size: 10, color: { argb: GREY } };
  if (span > 1) ws.mergeCells(row.number, 1, row.number, span);
  return row.number;
}

function setWidths(ws: ExcelJS.Worksheet, cols: Col[]) {
  cols.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    if (!col.width || col.width < c.w) col.width = c.w;
  });
}

/** A standard table: title → header → data rows → optional total row. */
function table(
  ws: ExcelJS.Worksheet,
  opts: {
    title: string;
    subtitle?: string;
    cols: Col[];
    rows: Cell[][];
    total?: Cell[];
    freeze?: boolean;
  },
) {
  const { title, subtitle, cols, rows, total } = opts;
  titleRow(ws, title, cols.length);
  if (subtitle) subtitleRow(ws, subtitle, cols.length);
  const header = ws.addRow(cols.map((c) => c.h));
  header.eachCell((cell, col) => headerCell(cell, cols[col - 1]?.a ?? "L"));
  header.height = 20;
  const headerRowNumber = header.number;

  if (rows.length === 0) {
    const empty = ws.addRow(["No data for this week."]);
    empty.getCell(1).font = { name: FONT, italic: true, color: { argb: GREY } };
    ws.mergeCells(empty.number, 1, empty.number, cols.length);
  }
  for (const r of rows) {
    const row = ws.addRow(r);
    row.eachCell((cell, col) => dataCell(cell, cols[col - 1] ?? { h: "", w: 10, a: "L" }));
  }
  if (total) {
    const row = ws.addRow(total);
    for (let i = 0; i < cols.length; i++) totalCell(row.getCell(i + 1), cols[i]!);
  }
  setWidths(ws, cols);
  if (opts.freeze) ws.views = [{ state: "frozen", ySplit: headerRowNumber }];
}

const money = (n: number | null): Cell => (n == null ? null : n);

/** Production table rows (Sections C / D and Owner channel mix). */
function productionRows(rows: WeeklyProductionRow[]): Cell[][] {
  return rows.map((r) => [r.label, r.rnSold, money(r.grossRevenue), money(r.arr), pc(r.share)]);
}

// ─── Sheet builders ──────────────────────────────────────────────────────────

function coverSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  const ws = wb.addWorksheet("Cover");
  ws.getColumn(1).width = 3;
  ws.getColumn(2).width = 70;
  const put = (r: number, text: string, style: Partial<ExcelJS.Font>) => {
    const cell = ws.getCell(`B${r}`);
    cell.value = text;
    cell.font = { name: FONT, ...style };
  };
  put(2, "WEEKLY REPORT", { bold: true, size: 26, color: { argb: TEAL } });
  put(3, d.property.name, { bold: true, size: 16, color: { argb: GOLD } });
  put(4, "Sales & Marketing", { size: 12, color: { argb: GREY } });
  ws.getCell("B4").border = { bottom: { style: "medium", color: { argb: GOLD } } };
  put(6, `Period:  ${d.week.label}`, { size: 12, color: { argb: INK } });
  put(7, `Week ${d.week.weekNumber} · ${d.week.year}`, { size: 12, color: { argb: INK } });
  put(8, `Status:  ${d.week.status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}`, { size: 12, color: { argb: INK } });
  put(10, `Confidential — ${d.property.name}`, { italic: true, size: 10, color: { argb: GREY } });
}

function overviewSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  const ws = wb.addWorksheet("A-Overview");
  ws.getColumn(1).width = 110;
  titleRow(ws, "A · Sales & Marketing Overview", 1, 16);
  ws.addRow([]);
  for (const b of d.overview) {
    const h = ws.addRow([b.heading]);
    h.getCell(1).font = { name: FONT, bold: true, size: 12, color: { argb: TEAL } };
    const body = ws.addRow([b.body && b.body.trim() ? b.body : "— not written for this week —"]);
    body.getCell(1).font = { name: FONT, size: 11, color: { argb: b.body ? INK : GREY } };
    body.getCell(1).alignment = { wrapText: true, vertical: "top" };
    ws.addRow([]);
  }
}

function monthlySheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  const ws = wb.addWorksheet("B-YTD");
  const widths = [13, 10, 9, 9, 9, 14, 14, 14, 16, 16, 16];
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  titleRow(ws, `B · Year to Date — Actual / Budget / Last Year — ${d.week.label}`, 11, 14);

  // Grouped two-row header.
  const r1 = ws.addRow(["Month", "RN Sold", "Occupancy %", "", "", "ARR (IDR)", "", "", "Revenue (IDR)", "", ""]);
  const r2 = ws.addRow(["", "", "Act", "Bud", "LY", "Act", "Bud", "LY", "Act", "Bud", "LY"]);
  ws.mergeCells(r1.number, 1, r2.number, 1); // Month
  ws.mergeCells(r1.number, 2, r2.number, 2); // RN Sold
  ws.mergeCells(r1.number, 3, r1.number, 5); // Occupancy %
  ws.mergeCells(r1.number, 6, r1.number, 8); // ARR
  ws.mergeCells(r1.number, 9, r1.number, 11); // Revenue
  [r1, r2].forEach((row) => row.eachCell((cell, col) => headerCell(cell, col <= 2 ? "L" : "C")));
  r1.height = 18;
  r2.height = 18;

  const occCols: Col = { h: "", w: 9, a: "R", f: PCT };
  const moneyCols: Col = { h: "", w: 14, a: "R", f: MONEY };
  const rowCols: Col[] = [
    { h: "", w: 13, a: "L" }, { h: "", w: 10, a: "R", f: NUM },
    occCols, occCols, occCols, moneyCols, moneyCols, moneyCols, moneyCols, moneyCols, moneyCols,
  ];

  for (const m of d.monthly.rows) {
    const row = ws.addRow([
      m.monthLabel, m.rnSold,
      m.occActual, m.occBudget, m.occLy,
      money(m.arrActual), money(m.arrBudget), money(m.arrLy),
      money(m.revActual), money(m.revBudget), money(m.revLy),
    ]);
    row.eachCell((cell, col) => dataCell(cell, rowCols[col - 1]!));
  }
  const t = d.monthly.totals;
  const totalRow = ws.addRow([
    "Total", t.rnSold, null, null, null,
    money(t.arrActual), money(t.arrBudget), money(t.arrLy),
    money(t.revActual), money(t.revBudget), money(t.revLy),
  ]);
  for (let i = 0; i < rowCols.length; i++) totalCell(totalRow.getCell(i + 1), rowCols[i]!);

  ws.views = [{ state: "frozen", ySplit: r2.number }];
}

function productionSheet(
  wb: ExcelJS.Workbook,
  name: string,
  title: string,
  labelHeader: string,
  d: { rows: WeeklyProductionRow[]; totals: { rn: number; revenue: number; arr: number | null } },
) {
  const ws = wb.addWorksheet(name);
  const cols: Col[] = [
    { h: labelHeader, w: 34, a: "L" },
    { h: "RN Sold", w: 11, a: "R", f: NUM },
    { h: "Gross Revenue", w: 18, a: "R", f: MONEY },
    { h: "ARR", w: 14, a: "R", f: MONEY },
    { h: "%", w: 9, a: "R", f: PCT },
  ];
  table(ws, {
    title,
    cols,
    rows: productionRows(d.rows),
    total: ["Total", d.totals.rn, money(d.totals.revenue), money(d.totals.arr), d.rows.length ? 1 : null],
    freeze: true,
  });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function channelsSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  const ws = wb.addWorksheet("E-F-Channel");
  const cols: Col[] = [
    { h: "Source", w: 20, a: "L" },
    ...MONTHS.map((m): Col => ({ h: m, w: 7, a: "R", f: NUM })),
    { h: "YTD", w: 10, a: "R", f: NUM },
    { h: "%", w: 8, a: "R", f: PCT },
  ];
  titleRow(ws, "E/F · Channel Inside (Room Nights)", cols.length, 14);

  const blocks = d.channelsByYear.length > 0 ? d.channelsByYear : [{ year: d.week.year, rows: [], ytdTotal: 0 }];
  for (const block of blocks) {
    ws.addRow([]);
    const yr = ws.addRow([String(block.year)]);
    yr.getCell(1).font = { name: FONT, bold: true, size: 12, color: { argb: GOLD } };
    const header = ws.addRow(cols.map((c) => c.h));
    header.eachCell((cell, col) => headerCell(cell, cols[col - 1]?.a ?? "L"));
    header.height = 18;
    for (const r of block.rows) {
      const row = ws.addRow([r.source, ...r.months, r.ytd, pc(r.share)]);
      row.eachCell((cell, col) => dataCell(cell, cols[col - 1]!));
    }
    const total = ws.addRow(["Total", ...MONTHS.map(() => null), block.ytdTotal, block.rows.length ? 1 : null]);
    for (let i = 0; i < cols.length; i++) totalCell(total.getCell(i + 1), cols[i]!);
  }
  setWidths(ws, cols);
  ws.views = [{ state: "frozen", xSplit: 1 }];
}

function activitySheet(
  wb: ExcelJS.Workbook,
  name: string,
  title: string,
  subjectHeader: string,
  rows: { dateLabel: string | null; title: string | null; notes: string | null }[],
) {
  const ws = wb.addWorksheet(name);
  const cols: Col[] = [
    { h: "Date", w: 16, a: "L" },
    { h: subjectHeader, w: 34, a: "L" },
    { h: "Notes / Remarks", w: 70, a: "L" },
  ];
  table(ws, {
    title,
    cols,
    rows: rows.map((r) => [r.dateLabel ?? "", r.title ?? "", r.notes ?? ""]),
    freeze: true,
  });
}

function socialSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  const ws = wb.addWorksheet("H-Social");
  const byPlatform = new Map<string, typeof d.social>();
  for (const s of d.social) {
    const arr = byPlatform.get(s.platform) ?? [];
    arr.push(s);
    byPlatform.set(s.platform, arr);
  }
  const cols: Col[] = [
    { h: "Metric", w: 22, a: "L" },
    { h: "Last Week", w: 13, a: "R", f: NUM },
    { h: "This Week", w: 13, a: "R", f: NUM },
    { h: "Growth", w: 12, a: "R", f: NUMRED },
    { h: "Growth %", w: 12, a: "R", f: PCTRED },
  ];
  titleRow(ws, "H · Social Media Insight", cols.length, 14);
  if (d.metricoolSync) {
    const m = d.metricoolSync;
    const when = new Date(m.syncedAt);
    const whenStr = Number.isNaN(when.getTime()) ? m.syncedAt : when.toISOString().slice(0, 16).replace("T", " ");
    const brand = m.brandLabel ? `${m.brandLabel} (${m.blogId})` : m.blogId;
    const src = ws.addRow([
      `Source: Metricool (brand ${brand}) · synced ${whenStr} UTC · this week ${m.thisWeek.from}–${m.thisWeek.to}, last week ${m.lastWeek.from}–${m.lastWeek.to}`,
    ]);
    src.getCell(1).font = { name: FONT, italic: true, size: 10, color: { argb: GREY } };
    ws.mergeCells(src.number, 1, src.number, cols.length);
  }
  if (byPlatform.size === 0) {
    const empty = ws.addRow(["No social metrics for this week."]);
    empty.getCell(1).font = { name: FONT, italic: true, color: { argb: GREY } };
  }
  const metricLabel: Record<string, string> = {
    website_visit: "Website Visit", profile_visit: "Profile Visit",
    account_reached: "Account Reached", impression: "Impression", followers: "Followers",
  };
  for (const [platform, rows] of byPlatform) {
    ws.addRow([]);
    const p = ws.addRow([platform]);
    p.getCell(1).font = { name: FONT, bold: true, size: 12, color: { argb: GOLD } };
    const header = ws.addRow(cols.map((c) => c.h));
    header.eachCell((cell, col) => headerCell(cell, cols[col - 1]?.a ?? "L"));
    for (const s of rows) {
      const row = ws.addRow([metricLabel[s.metric] ?? s.metric, s.lastWeek, s.thisWeek, s.growth, pc(s.growthPct)]);
      row.eachCell((cell, col) => dataCell(cell, cols[col - 1]!));
    }
  }

  // Summary: Overall Highlights / Strength / Weakness.
  const n = d.socialNarrative;
  if (n.highlights || n.strength || n.weakness) {
    ws.addRow([]);
    titleRow(ws, "Summary", cols.length, 12);
    const note = (label: string, body: string | null) => {
      if (!body) return;
      const h = ws.addRow([label]);
      h.getCell(1).font = { name: FONT, bold: true, size: 11, color: { argb: TEAL } };
      const bodyRow = ws.addRow([body]);
      bodyRow.getCell(1).font = { name: FONT, size: 11, color: { argb: INK } };
      bodyRow.getCell(1).alignment = { wrapText: true, vertical: "top" };
      ws.mergeCells(bodyRow.number, 1, bodyRow.number, cols.length);
    };
    note("Overall Highlights", n.highlights);
    note("Strength", n.strength);
    note("Weakness", n.weakness);
  }

  setWidths(ws, cols);
}

function graphicDesignSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  if (d.graphicDesign.length === 0) return;
  const ws = wb.addWorksheet("Graphic Design");
  const cols: Col[] = [
    { h: "Task", w: 70, a: "L" },
    { h: "Status", w: 16, a: "L" },
  ];
  table(ws, {
    title: "Graphic Design Report",
    cols,
    rows: d.graphicDesign.map((g) => [g.task, g.status ?? ""]),
    freeze: true,
  });
}

function smActivitySheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  if (d.smActivities.length === 0) return;
  const ws = wb.addWorksheet("SM Activity");
  const cols: Col[] = [
    { h: "Date", w: 20, a: "L" },
    { h: "Subject", w: 34, a: "L" },
    { h: "Activity", w: 70, a: "L" },
  ];
  titleRow(ws, "Social Media & Marketing Activity", cols.length, 14);
  for (const block of d.smActivities) {
    ws.addRow([]);
    const t = ws.addRow([block.title]);
    t.getCell(1).font = { name: FONT, bold: true, size: 12, color: { argb: GOLD } };
    const header = ws.addRow(cols.map((c) => c.h));
    header.eachCell((cell, col) => headerCell(cell, cols[col - 1]?.a ?? "L"));
    for (const r of block.rows) {
      const row = ws.addRow([r.dateLabel ?? "", r.title ?? "", r.notes ?? ""]);
      row.eachCell((cell, col) => dataCell(cell, cols[col - 1]!));
    }
  }
  setWidths(ws, cols);
}

function trainingSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  const ws = wb.addWorksheet("I-Training");
  const cols: Col[] = [
    { h: "Date", w: 14, a: "L" },
    { h: "Topic", w: 34, a: "L" },
    { h: "Duration", w: 12, a: "L" },
    { h: "Trainer", w: 18, a: "L" },
    { h: "Participants", w: 44, a: "L" },
  ];
  table(ws, {
    title: "I · Training",
    cols,
    rows: d.departments.trainings.map((t) => [t.dateLabel ?? "", t.topic, t.duration ?? "", t.trainer ?? "", t.participants ?? ""]),
    freeze: true,
  });
}

function plansSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  const ws = wb.addWorksheet("J-ActionPlan");
  const cols: Col[] = [
    { h: "Category", w: 20, a: "L" },
    { h: "Plan", w: 24, a: "L" },
    { h: "Start", w: 14, a: "L" },
    { h: "Deadline", w: 14, a: "L" },
    { h: "Remark", w: 70, a: "L" },
  ];
  table(ws, {
    title: "J · Next Week Action Plan",
    cols,
    rows: d.departments.actionPlans.map((a) => [a.category ?? "", a.plan, a.startLabel ?? "", a.deadlineLabel ?? "", a.remark ?? ""]),
    freeze: true,
  });
}

function ownerSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  const ws = wb.addWorksheet("Owner Overview");
  titleRow(ws, "Owner Overview", 5, 16);
  ws.addRow([]);

  // 1 · Repeater Guest
  const repCols: Col[] = [
    { h: "Month", w: 22, a: "L" },
    { h: "Room Nights", w: 13, a: "R", f: NUM },
    { h: "ADR", w: 14, a: "R", f: MONEY },
    { h: "Revenue", w: 18, a: "R", f: MONEY },
    { h: "", w: 4, a: "L" },
  ];
  titleRow(ws, "1 · Repeater Guest — Room Performance", repCols.length, 12);
  const rh = ws.addRow(repCols.map((c) => c.h));
  rh.eachCell((cell, col) => headerCell(cell, repCols[col - 1]?.a ?? "L"));
  for (const r of d.owner.repeaters) {
    const row = ws.addRow([r.label, r.roomNights, money(r.adr), money(r.revenue), null]);
    row.eachCell((cell, col) => dataCell(cell, repCols[col - 1]!));
  }
  const rt = ws.addRow(["Total", d.owner.repeaterTotals.roomNights, money(d.owner.repeaterTotals.adr), money(d.owner.repeaterTotals.revenue), null]);
  for (let i = 0; i < repCols.length; i++) totalCell(rt.getCell(i + 1), repCols[i]!);

  ws.addRow([]);
  ws.addRow([]);

  // 2 · Channel Mix
  const mixCols: Col[] = [
    { h: "Source", w: 34, a: "L" },
    { h: "RN Sold", w: 11, a: "R", f: NUM },
    { h: "ARR", w: 14, a: "R", f: MONEY },
    { h: "Revenue", w: 18, a: "R", f: MONEY },
    { h: "%", w: 9, a: "R", f: PCT },
  ];
  titleRow(ws, "2 · Channel Mix (Market Segmentation)", mixCols.length, 12);
  const mh = ws.addRow(mixCols.map((c) => c.h));
  mh.eachCell((cell, col) => headerCell(cell, mixCols[col - 1]?.a ?? "L"));
  for (const r of d.owner.channelMix) {
    const row = ws.addRow([r.label, r.rnSold, money(r.arr), money(r.grossRevenue), pc(r.share)]);
    row.eachCell((cell, col) => dataCell(cell, mixCols[col - 1]!));
  }
  const mt = ws.addRow(["Total", d.owner.channelMixTotals.rnSold, money(d.owner.channelMixTotals.arr), money(d.owner.channelMixTotals.revenue), d.owner.channelMix.length ? 1 : null]);
  for (let i = 0; i < mixCols.length; i++) totalCell(mt.getCell(i + 1), mixCols[i]!);

  for (let i = 0; i < 5; i++) ws.getColumn(i + 1).width = mixCols[i]!.w;
  ws.getColumn(1).width = 34;
}

function adsSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  if (!d.ads.hasData || !d.ads.blended) return;
  const ws = wb.addWorksheet("Ads-ROAS");
  const b = d.ads.blended;
  const cols: Col[] = [
    { h: "Scope", w: 16, a: "L" },
    { h: "Spend", w: 16, a: "R", f: MONEY },
    { h: "Revenue", w: 18, a: "R", f: MONEY },
    { h: "Conversions", w: 13, a: "R", f: NUM },
    { h: "Impr.", w: 12, a: "R", f: NUM },
    { h: "Clicks", w: 11, a: "R", f: NUM },
    { h: "ROAS", w: 9, a: "R", f: "0.0" },
  ];
  const rows: Cell[][] = [
    ["Blended", money(b.spend), money(b.revenue), b.conversions, b.impressions, b.clicks, b.roas],
    ...d.ads.platforms.map((p): Cell[] => [p.label, money(p.spend), money(p.revenue), p.conversions, p.impressions, p.clicks, p.roas]),
  ];
  table(ws, {
    title: `Digital Ads & ROAS${d.ads.window.from ? ` — ${d.ads.window.from} → ${d.ads.window.to}` : ""}`,
    subtitle: d.ads.summary?.headline,
    cols,
    rows,
    freeze: true,
  });
  if (d.ads.campaigns.length > 0) {
    ws.addRow([]);
    const cc: Col[] = [
      { h: "Campaign", w: 40, a: "L" },
      { h: "Platform", w: 12, a: "L" },
      { h: "Impr.", w: 12, a: "R", f: NUM },
      { h: "Clicks", w: 11, a: "R", f: NUM },
      { h: "Spend", w: 16, a: "R", f: MONEY },
      { h: "Conv.", w: 11, a: "R", f: NUM },
      { h: "Attr. Rev", w: 18, a: "R", f: MONEY },
      { h: "ROAS", w: 9, a: "R", f: "0.0" },
    ];
    titleRow(ws, "Campaigns", cc.length, 12);
    const h = ws.addRow(cc.map((c) => c.h));
    h.eachCell((cell, col) => headerCell(cell, cc[col - 1]?.a ?? "L"));
    for (const c of d.ads.campaigns) {
      const row = ws.addRow([c.name, c.platformLabel, c.impressions, c.clicks, money(c.spend), c.conversions, money(c.revenue), c.roas]);
      row.eachCell((cell, col) => dataCell(cell, cc[col - 1]!));
    }
    setWidths(ws, cc);
  }
}

function screenshotsSheet(wb: ExcelJS.Workbook, d: WeeklyExportData) {
  if (d.screenshots.length === 0) return;
  const ws = wb.addWorksheet("SM-Screenshots");
  const cols: Col[] = [
    { h: "Category", w: 20, a: "L" },
    { h: "Title", w: 28, a: "L" },
    { h: "Summary", w: 80, a: "L" },
  ];
  table(ws, {
    title: "SM · Screenshots & Summaries",
    cols,
    rows: d.screenshots.map((s) => [screenshotCategoryLabel(s.category), s.title ?? "", s.summary ?? ""]),
    freeze: true,
  });
}

/** Build the styled weekly workbook as an .xlsx buffer. */
export async function buildWeeklyXlsxBuffer(
  d: WeeklyExportData,
  selected: Set<string> | null,
): Promise<Buffer> {
  const show = (id: string) => !selected || selected.has(id);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Blue Karma Group";
  wb.created = d.week ? new Date(`${d.week.endDate}T00:00:00.000Z`) : new Date(0);

  coverSheet(wb, d);
  if (show("overview")) overviewSheet(wb, d);
  if (show("monthly")) monthlySheet(wb, d);
  if (show("segments")) productionSheet(wb, "C-Segment", "C · Weekly Production by Market Segment", "Source / Segment", d.segments);
  if (show("ratecodes")) productionSheet(wb, "D-RateCode", "D · Rate Code / Promotion", "Promotion", d.rateCodes);
  if (show("channels")) channelsSheet(wb, d);
  if (show("departments")) {
    activitySheet(wb, "G-Sales", "G · Sales Activity", "Subject", d.departments.sales);
    activitySheet(wb, "G2-Ecommerce", "G2 · E-commerce Activities", "Task", d.departments.ecommerce);
    trainingSheet(wb, d);
  }
  if (show("social")) {
    socialSheet(wb, d);
    graphicDesignSheet(wb, d);
    smActivitySheet(wb, d);
  }
  if (show("plans")) plansSheet(wb, d);
  if (show("owner")) ownerSheet(wb, d);
  if (show("ads")) adsSheet(wb, d);
  if (show("screenshots")) screenshotsSheet(wb, d);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
