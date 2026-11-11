/**
 * Ingest the VHP Account Production (YTD) feed into the monthly Sales Highlight.
 *
 * The scraper pulls VHP's "Forecast Room Production" report year-to-date
 * (Jan 1 → the report month's end) and POSTs the per-account totals here. This
 * replaces the ACCOUNTS section for that (property, period): it finds-or-creates
 * the ReportPeriod, resolves each account's SEGMENT from the saved rules (or the
 * sent type / automatic classification), drops EXCLUDE accounts (totals,
 * vouchers), replaces account_production in one transaction, and records an
 * ImportHistory + audit row. A FINAL period is locked, like the Excel import.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getSegmentRuleMap } from "@/lib/sales/account-segment-rules";
import { accountKey, isExcluded, resolveSegment } from "@/lib/sales/account-segments";
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
        excluded: number;
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

    const { rows, skipped, merged } = normalizeAccountRows(input.accounts);
    if (rows.length === 0) return fail(422, "no valid account rows found.");

    // Resolve each account's segment (saved rule > sent type > classify) and
    // drop the ones mapped to EXCLUDE (totals, vouchers, …).
    const ruleMap = await getSegmentRuleMap();
    const resolved = rows.map((r) => ({
      ...r,
      segment: resolveSegment(r.accountName, { rule: ruleMap.get(accountKey(r.accountName)), hint: r.typeHint }),
    }));
    const kept = resolved.filter((r) => !isExcluded(r.segment));
    const excluded = resolved.length - kept.length;
    if (kept.length === 0) return fail(422, "no accounts left after exclusions.");

    const periodId = await prisma.$transaction(async (tx) => {
      const period =
        existing ??
        (await tx.reportPeriod.create({
          data: { propertyId: property.id, period: date, status: "DRAFT" },
          select: { id: true, status: true },
        }));
      await tx.accountProduction.deleteMany({ where: { periodId: period.id } });
      await tx.accountProduction.createMany({
        data: kept.map((r) => ({
          periodId: period.id,
          accountName: r.accountName,
          accountType: r.segment,
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
          rowCounts: { ACCOUNTS: kept.length },
        },
      });
      return period.id;
    });

    const roomNights = kept.reduce((s, r) => s + r.roomNights, 0);
    const revenue = kept.reduce((s, r) => s + r.revenue, 0);

    await logAudit("sales_account_production_import", code, {
      period: input.period,
      accounts: kept.length,
      roomNights,
      excluded,
      skipped,
      merged,
      source: input.source ?? null,
    }).catch(() => {});

    const notes = [
      excluded > 0 ? `excluded ${excluded}` : "",
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
        accounts: kept.length,
        roomNights,
        revenue,
        excluded,
        skipped,
        merged,
        message: `Account Production (YTD) stored — ${kept.length} account(s) for ${input.period}${notes.length ? ` (${notes.join("; ")})` : ""}.`,
      },
    };
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : "account production import failed.");
  }
}
