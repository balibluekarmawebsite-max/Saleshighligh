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
  parseWeeklyRows,
} from "@/lib/weekly/import";

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
          annualBudgetSave = parsed.rows.map((row) => ({
            month: num(row.month) ?? 0,
            occFraction: pct(row.occBudget),
            arr: num(row.arrBudget),
            revenue: num(row.revBudget),
          }));
          annualLastYearSave = parsed.rows.map((row) => ({
            month: num(row.month) ?? 0,
            occFraction: pct(row.occLy),
            arr: num(row.arrLy),
            revenue: num(row.revLy),
          }));
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
          await tx.weeklyChannelRn.deleteMany({ where: { reportWeekId: rid } });
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

  // Section B budget & last year → the fixed annual references (own transactions).
  if (annualBudgetSave) {
    await saveAnnualBudget(report.propertyId, report.year, annualBudgetSave);
  }
  if (annualLastYearSave) {
    await saveAnnualLastYear(report.propertyId, report.year, annualLastYearSave);
  }

  await logAudit("weekly_import", `${property} ${week}`, { section: sectionId, rows: written });
  revalidatePath(`/weekly/${property}/${week}/import`);
  revalidatePath(`/weekly/${property}/${week}/dashboard`);
  return { ok: true, written };
}
