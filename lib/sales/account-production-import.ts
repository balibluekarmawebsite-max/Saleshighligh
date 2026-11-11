/**
 * Ingest the VHP Account Production (YTD) feed into the monthly Sales Highlight.
 *
 * The scraper pulls VHP's "Forecast Room Production" report year-to-date
 * (Jan 1 → the report month's end) and POSTs the per-account totals here. This
 * replaces the ACCOUNTS workbook tab for that section: it finds-or-creates the
 * (property, period) ReportPeriod, replaces its account_production rows in one
 * transaction, and records an ImportHistory + audit row. A FINAL period is
 * locked, exactly like the Excel import.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeAccountRows, type RawAccountRow } from "@/lib/sales/account-production-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

export interface AccountProductionImportInput {
  property: string;
  /** Report month, "YYYY-MM"; the data is YTD through this month. */
  period: string;
  accounts: RawAccountRow[];
  source?: string;
  uploadedBy?: string | null;
}

export interface AccountProductionResult {
  status: number;
  body:
    | {
        ok: true;
        property: string;
        period: string;
        periodId: string;
        accounts: number;
        roomNights: number;
        revenue: number;
        classified: number;
        skipped: number;
        merged: number;
        message: string;
      }
    | { ok: false; error: string };
}

const fail = (status: number, error: string): AccountProductionResult => ({ status, body: { ok: false, error } });

/** True for a real YYYY-MM that round-trips (rejects month 00 / 13). */
function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function runAccountProductionImport(
  input: AccountProductionImportInput,
): Promise<AccountProductionResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return fail(400, "property is required.");
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return fail(400, "period must be a real month in YYYY-MM form.");
    if (!Array.isArray(input.accounts) || input.accounts.length === 0) {
      return fail(400, "accounts[] is required (each {account, roomNights, revenue}).");
    }

    const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
    if (!property) return fail(400, `unknown property "${code}".`);

    const existing = await prisma.reportPeriod.findUnique({
      where: { propertyId_period: { propertyId: property.id, period: date } },
      select: { id: true, status: true },
    });
    if (existing?.status === "FINAL") {
      return fail(409, "This report period is marked FINAL and is locked for editing.");
    }

    const { rows, skipped, classified, merged } = normalizeAccountRows(input.accounts);
    if (rows.length === 0) return fail(422, "no valid account rows found.");

    const periodId = await prisma.$transaction(async (tx) => {
      const period =
        existing ??
        (await tx.reportPeriod.create({
          data: { propertyId: property.id, period: date, status: "DRAFT" },
          select: { id: true, status: true },
        }));
      await tx.accountProduction.deleteMany({ where: { periodId: period.id } });
      await tx.accountProduction.createMany({
        data: rows.map((r) => ({
          periodId: period.id,
          accountName: r.accountName,
          accountType: r.accountType,
          roomNights: r.roomNights,
          revenue: r.revenue,
        })),
      });
      await tx.importHistory.create({
        data: {
          propertyId: property.id,
          period: date,
          fileName: `VHP Forecast Room Production (YTD) — ${input.source ?? "api"}`,
          uploadedBy: input.uploadedBy ?? null,
          rowCounts: { ACCOUNTS: rows.length },
        },
      });
      return period.id;
    });

    const roomNights = rows.reduce((s, r) => s + r.roomNights, 0);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);

    await logAudit("sales_account_production_import", code, {
      period: input.period,
      accounts: rows.length,
      roomNights,
      classified,
      skipped,
      merged,
      source: input.source ?? null,
    }).catch(() => {});

    const notes = [
      classified > 0 ? `classified ${classified} by name` : "",
      merged > 0 ? `merged ${merged} duplicate(s)` : "",
      skipped > 0 ? `skipped ${skipped} invalid` : "",
    ].filter(Boolean);
    return {
      status: 200,
      body: {
        ok: true,
        property: code,
        period: input.period,
        periodId,
        accounts: rows.length,
        roomNights,
        revenue,
        classified,
        skipped,
        merged,
        message: `Account Production (YTD) stored — ${rows.length} account(s) for ${input.period}${notes.length ? ` (${notes.join("; ")})` : ""}.`,
      },
    };
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : "account production import failed.");
  }
}
