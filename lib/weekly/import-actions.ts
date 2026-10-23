"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveAnnualBudget, type AnnualBudgetInput } from "@/lib/weekly/annual-budget";
import { saveAnnualLastYear, type AnnualLastYearInput } from "@/lib/weekly/annual-lastyear";
import { isLockedStatus } from "@/lib/weekly/editor-data";
import {
  type ParseIssue,
  type ParseResult,
  parseBaselineRows,
  parseWeeklyRows,
} from "@/lib/weekly/import";
import { normalizeNumber } from "@/lib/import/parse";
import { isGroqConfigured } from "@/lib/weekly/import/ai";
import { BASELINE_AI_SECTION } from "@/lib/weekly/import/ai-sections";
import {
  type Cell,
  cleanBaselineRows,
  detectBaselineFromGrid,
  detectedRowsToPreview,
} from "@/lib/weekly/import/baseline-workbook";
import { extractSectionRows } from "@/lib/weekly/import/extract";

export interface ApplyResult {
  ok: boolean;
  message?: string;
  written?: number;
  issues?: ParseIssue[];
}

/** Read the first sheet of an uploaded CSV/Excel file into records. */
async function readRecords(file: File): Promise<Record<string, unknown>[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const first = wb.SheetNames[0];
  if (!first) return [];
  const sheet = wb.Sheets[first];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
}

function readForm(formData: FormData) {
  return {
    property: String(formData.get("property") ?? "").toUpperCase(),
    week: String(formData.get("week") ?? ""),
    sectionId: String(formData.get("sectionId") ?? ""),
    file: formData.get("file"),
  };
}

/** Parse + validate the uploaded file without writing anything. */
export async function previewImport(formData: FormData): Promise<ParseResult> {
  const { sectionId, file } = readForm(formData);
  if (!(file instanceof File) || file.size === 0) {
    return { sectionId, title: sectionId, rowCount: 0, rows: [], issues: [{ row: 0, message: "Attach a .csv or .xlsx file." }], ok: false };
  }
  const records = await readRecords(file);
  return parseWeeklyRows(sectionId, records);
}

const num = (v: number | string | null | undefined): number | null =>
  typeof v === "number" ? v : null;
const pct = (v: number | string | null | undefined): number | null =>
  typeof v === "number" ? v / 100 : null;

/**
 * True when at least one month carries a real value. Used to decide whether an
 * import touches the FIXED annual Budget / Last Year tables at all: those saves
 * are replace-all for the year, so an actuals-only file (every budget/LY cell
 * blank) must NOT reach them — otherwise it would wipe the whole year's fixed
 * reference that the Budget & Last Year page owns.
 */
const hasAnyBaselineValue = (
  items: { occFraction: number | null; arr: number | null; revenue: number | null }[],
): boolean => items.some((i) => i.occFraction != null || i.arr != null || i.revenue != null);

// Locale-aware number parsing (handles "2.261.496" and "83,33%"), and the
// empty string → null (NOT 0), so a blank cell never becomes a real 0 that
// would defeat the per-side guard or overwrite a value with 0.
const numStr = (v: unknown): number | null => normalizeNumber(v);
/** Percent string/number (0–100) → stored fraction (0–1); blank → null. */
const pctStr = (v: unknown): number | null => {
  const n = normalizeNumber(v);
  return n == null ? null : n / 100;
};

type PreviewRow = Record<string, string>;
type BaselineItem = { month: number; occFraction: number | null; arr: number | null; revenue: number | null };

/**
 * Write the fixed Budget + Last Year for a property + year. Each side is written
 * only when it carries values (so a budget-only source never touches Last Year
 * and vice versa), both in one transaction, and in MERGE mode — only the months
 * present are upserted; months absent from the file are left untouched, never
 * deleted. (Clearing a month is done on the grid, not by an upload.)
 */
async function writeAnnualBaseline(
  propertyId: string,
  year: number,
  budgetItems: BaselineItem[],
  lyItems: BaselineItem[],
): Promise<{ ok: boolean; message?: string }> {
  const hasBudget = hasAnyBaselineValue(budgetItems);
  const hasLy = hasAnyBaselineValue(lyItems);
  if (!hasBudget && !hasLy) {
    return { ok: false, message: "No Budget or Last Year values found." };
  }
  await prisma.$transaction(async (tx) => {
    if (hasBudget) await saveAnnualBudget(propertyId, year, budgetItems, tx, { merge: true });
    if (hasLy) await saveAnnualLastYear(propertyId, year, lyItems, tx, { merge: true });
  });
  return { ok: true };
}

/** Map clean preview rows → the Budget + Last Year item arrays for writing. */
function baselineItemsFromRows(rows: PreviewRow[]): { budget: BaselineItem[]; lastyear: BaselineItem[] } {
  const budget = rows.map((r) => ({
    month: Number(r.month),
    occFraction: pctStr(r.budgetOcc),
    arr: numStr(r.budgetArr),
    revenue: numStr(r.budgetRevenue),
  }));
  const lastyear = rows.map((r) => ({
    month: Number(r.month),
    occFraction: pctStr(r.lastyearOcc),
    arr: numStr(r.lastyearArr),
    revenue: numStr(r.lastyearRevenue),
  }));
  return { budget, lastyear };
}

/** Is this file an image (screenshot) rather than a spreadsheet? */
function isImageFile(file: File): boolean {
  return (file.type || "").startsWith("image/") || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
}

/**
 * Detect the Budget & Last Year rows in a spreadsheet buffer, DETERMINISTICALLY
 * (no AI): our strict template columns first, then the standard "Budget / Last
 * Year" monthly table anywhere in the workbook (any sheet) — the report's own
 * export format. Reads every month row (no AI truncation). Returns [] if none.
 */
function detectBaselineInWorkbook(buf: Buffer): PreviewRow[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return [];
  }

  // 1. Strict template (our exact headers) on the first sheet.
  const firstName = wb.SheetNames[0];
  const firstSheet = firstName ? wb.Sheets[firstName] : undefined;
  if (firstSheet) {
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null });
    const parsed = parseBaselineRows(records);
    if (parsed.rows.length > 0) {
      const cleaned = cleanBaselineRows(
        parsed.rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)]))),
      );
      if (cleaned.length > 0) return cleaned;
    }
  }

  // 2. Detect the standard Budget / Last Year table in any sheet.
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, blankrows: false });
    const detected = detectBaselineFromGrid(grid);
    if (detected.length > 0) {
      const cleaned = cleanBaselineRows(detectedRowsToPreview(detected));
      if (cleaned.length > 0) return cleaned;
    }
  }
  return [];
}

/**
 * Read a Budget & Last Year file (CSV / Excel) for PREVIEW — no AI, no writes.
 * Reads our template or the report's own Budget/Last Year table deterministically
 * (every month, locale-aware numbers: Indonesian "2.261.496" / "83,33%").
 */
export async function readBaselineFile(
  formData: FormData,
): Promise<{ ok: boolean; rows?: PreviewRow[]; message?: string }> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const file = formData.get("file");
  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have import access to ${property}.` };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Attach a .csv or .xlsx file." };
  }

  const rows = detectBaselineInWorkbook(Buffer.from(await file.arrayBuffer()));
  if (rows.length > 0) return { ok: true, rows };
  return {
    ok: false,
    message: "Couldn't find a Budget & Last Year table in that file. Use the template, or try AI mode.",
  };
}

/**
 * AI step 1 — read a budget sheet in ANY layout for preview. Writes nothing.
 * For a spreadsheet it ALWAYS reads deterministically first (every month, no AI
 * row-truncation); the Groq model is used only for images/screenshots, or for a
 * spreadsheet whose table couldn't be detected. Returns clean rows (one per
 * valid month, ≤12). EDITOR/ADMIN + property access.
 */
export async function aiExtractBaseline(
  formData: FormData,
): Promise<{ ok: boolean; rows?: PreviewRow[]; message?: string }> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const file = formData.get("file");
  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have import access to ${property}.` };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Attach a .csv, .xlsx or screenshot file." };
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Spreadsheet → deterministic read (reads all 12 months; no AI truncation).
  if (!isImageFile(file)) {
    const detected = detectBaselineInWorkbook(buf);
    if (detected.length > 0) return { ok: true, rows: detected };
  }

  // Image, or a spreadsheet with an undetectable layout → Groq.
  if (!isGroqConfigured()) {
    return {
      ok: false,
      message: isImageFile(file)
        ? "Reading a screenshot needs AI — set GROQ_API_KEY on the server, or upload the Excel/CSV file instead."
        : "Couldn't read a Budget & Last Year table from that file. Use the Excel/CSV template, or set GROQ_API_KEY to let AI read it.",
    };
  }
  const res = await extractSectionRows(BASELINE_AI_SECTION, {
    file: { buffer: buf, filename: file.name, type: file.type || "" },
  });
  if (!res.ok) return { ok: false, message: res.error };
  const rows = cleanBaselineRows(res.rows);
  if (rows.length === 0) {
    return { ok: false, message: "The AI didn't find any month rows (1–12) in that file." };
  }
  return { ok: true, rows };
}

/**
 * Step 2 — commit the previewed rows (from AI or the file reader) to the fixed
 * Budget & Last Year for a property + year. MERGE per side: only the months in
 * the file are written; months not in the file are left unchanged. Separate
 * from the read step so the user reviews before anything writes.
 */
export async function applyBaselineRows(input: {
  property: string;
  year: number;
  rows: Record<string, string>[];
}): Promise<ApplyResult> {
  const property = String(input.property ?? "").toUpperCase();
  const year = Number(input.year);
  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have import access to ${property}.` };
  }
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, message: "Invalid year." };
  }
  const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
  if (!prop) return { ok: false, message: "Property not found." };

  const rows = cleanBaselineRows(input.rows);
  if (rows.length === 0) {
    return { ok: false, message: "No month rows (1–12) to apply." };
  }

  const { budget, lastyear } = baselineItemsFromRows(rows);
  const w = await writeAnnualBaseline(prop.id, year, budget, lastyear);
  if (!w.ok) return { ok: false, message: w.message };

  await logAudit("weekly_baseline_ai_import", `${property} ${year}`, { rows: rows.length });
  revalidatePath(`/weekly/${property}`, "layout");
  return { ok: true, written: rows.length };
}

/** Re-parse and, if clean, write the rows (replace-all for the section). */
export async function applyWeeklyImport(formData: FormData): Promise<ApplyResult> {
  const { property, week, sectionId, file } = readForm(formData);
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Attach a .csv or .xlsx file." };
  }
  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have import access to ${property}.` };
  }

  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: property }, endDate: new Date(`${week}T00:00:00.000Z`) },
    select: { id: true, status: true, propertyId: true, year: true },
  });
  if (!report) return { ok: false, message: "Report not found." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to import." };
  }

  const parsed = parseWeeklyRows(sectionId, await readRecords(file));
  if (!parsed.ok) {
    return { ok: false, message: "Fix the highlighted rows and try again.", issues: parsed.issues };
  }
  if (parsed.rows.length === 0) {
    return { ok: false, message: "No valid rows found in the file." };
  }

  const rid = report.id;
  let written = 0;
  // Section B budget & last year → the fixed annual references (saved after the
  // tx, below) — never the per-week stat.
  let annualBudgetSave: AnnualBudgetInput[] | null = null;
  let annualLastYearSave: AnnualLastYearInput[] | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      switch (sectionId) {
        case "monthly": {
          // Actuals → per-week stats; Budget & Last Year → the fixed annual
          // references (shared across every week of the year).
          await tx.weeklyMonthlyStat.deleteMany({ where: { reportWeekId: rid } });
          const r = await tx.weeklyMonthlyStat.createMany({
            data: parsed.rows.map((row) => ({
              reportWeekId: rid,
              month: num(row.month) ?? 0,
              rnSold: num(row.rnSold),
              occActual: pct(row.occActual),
              arrActual: num(row.arrActual),
              revActual: num(row.revActual),
            })),
          });
          written = r.count;
          // Only touch the FIXED Budget / Last Year tables when the file
          // actually carries those columns — an actuals-only import (the common
          // PMS case) must leave the year's fixed reference untouched, never
          // clear it (the saves are replace-all for the year).
          const budgetItems = parsed.rows.map((row) => ({
            month: num(row.month) ?? 0,
            occFraction: pct(row.occBudget),
            arr: num(row.arrBudget),
            revenue: num(row.revBudget),
          }));
          annualBudgetSave = hasAnyBaselineValue(budgetItems) ? budgetItems : null;
          const lyItems = parsed.rows.map((row) => ({
            month: num(row.month) ?? 0,
            occFraction: pct(row.occLy),
            arr: num(row.arrLy),
            revenue: num(row.revLy),
          }));
          annualLastYearSave = hasAnyBaselineValue(lyItems) ? lyItems : null;
          break;
        }
        case "segment": {
          await tx.weeklySegmentProduction.deleteMany({ where: { reportWeekId: rid } });
          const r = await tx.weeklySegmentProduction.createMany({
            data: parsed.rows.map((row, i) => ({
              reportWeekId: rid,
              label: String(row.label ?? ""),
              segmentGroup: row.segmentGroup == null ? null : String(row.segmentGroup),
              rnSold: num(row.rnSold),
              grossRevenue: num(row.grossRevenue),
              sortOrder: i,
            })),
          });
          written = r.count;
          break;
        }
        case "ratecode": {
          await tx.weeklyRateCodeProduction.deleteMany({ where: { reportWeekId: rid } });
          const r = await tx.weeklyRateCodeProduction.createMany({
            data: parsed.rows.map((row, i) => ({
              reportWeekId: rid,
              label: String(row.label ?? ""),
              rnSold: num(row.rnSold),
              grossRevenue: num(row.grossRevenue),
              sortOrder: i,
            })),
          });
          written = r.count;
          break;
        }
        case "channel": {
          // Replace only the year(s) being imported, so carried-forward rows for
          // other years aren't wiped (matches the per-year save/apply paths).
          const importedYears = [...new Set(parsed.rows.map((row) => num(row.year) ?? 0))];
          await tx.weeklyChannelRn.deleteMany({ where: { reportWeekId: rid, year: { in: importedYears } } });
          const r = await tx.weeklyChannelRn.createMany({
            data: parsed.rows.map((row, i) => ({
              reportWeekId: rid,
              year: num(row.year) ?? 0,
              sourceLabel: String(row.sourceLabel ?? ""),
              jan: num(row.jan) ?? 0, feb: num(row.feb) ?? 0, mar: num(row.mar) ?? 0,
              apr: num(row.apr) ?? 0, may: num(row.may) ?? 0, jun: num(row.jun) ?? 0,
              jul: num(row.jul) ?? 0, aug: num(row.aug) ?? 0, sep: num(row.sep) ?? 0,
              oct: num(row.oct) ?? 0, nov: num(row.nov) ?? 0, dec: num(row.dec) ?? 0,
              sortOrder: i,
            })),
          });
          written = r.count;
          break;
        }
        default:
          throw new Error(`Unknown section: ${sectionId}`);
      }

      await tx.weeklyImport.create({
        data: {
          userId: user && user.id !== "system" ? user.id : null,
          propertyId: report.propertyId,
          reportWeekId: rid,
          source: "manual",
          originalFilename: file.name,
          status: "applied",
          periodLabel: week,
          summary: { section: sectionId, rows: written },
          appliedAt: new Date(),
        },
      });
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Import failed." };
  }

  // Section B budget & last year → the fixed annual references, together in one
  // transaction so a failure can't leave only one of them written.
  if (annualBudgetSave || annualLastYearSave) {
    await prisma.$transaction(async (tx) => {
      if (annualBudgetSave) await saveAnnualBudget(report.propertyId, report.year, annualBudgetSave, tx);
      if (annualLastYearSave) await saveAnnualLastYear(report.propertyId, report.year, annualLastYearSave, tx);
    });
  }

  await logAudit("weekly_import", `${property} ${week}`, { section: sectionId, rows: written });
  revalidatePath(`/weekly/${property}/${week}/import`);
  revalidatePath(`/weekly/${property}/${week}/dashboard`);
  return { ok: true, written };
}
