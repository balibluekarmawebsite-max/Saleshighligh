/**
 * Persist the Booking.com "Market Area Update" monthly series into
 * MarketAreaStat for one (property, period). The whole series is owned by the
 * report period, so the save replaces every row for that period (deleteMany +
 * createMany) in one transaction. Find-or-create the period (FINAL locked),
 * audit.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  marketAreaHasData,
  normalizeMarketAreaRows,
  statMonthToDate,
  type RawMarketAreaRow,
} from "@/lib/sales/market-area-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface MarketAreaImportInput {
  property: string;
  period: string; // YYYY-MM
  rows?: unknown; // raw grid rows (month + 4 metrics, strings)
  source?: string;
  uploadedBy?: string | null;
}

export interface MarketAreaResult {
  ok: boolean;
  message: string;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveMarketArea(input: MarketAreaImportInput): Promise<MarketAreaResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const rawRows = Array.isArray(input.rows) ? (input.rows as RawMarketAreaRow[]) : [];
    const rows = normalizeMarketAreaRows(rawRows);
    if (!marketAreaHasData(rows)) {
      return { ok: false, message: "Nothing to save — enter at least one month with room nights or ADR." };
    }

    const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
    if (!property) return { ok: false, message: `unknown property "${code}".` };

    await prisma.$transaction(async (tx) => {
      const period = await tx.reportPeriod.upsert({
        where: { propertyId_period: { propertyId: property.id, period: date } },
        create: { propertyId: property.id, period: date, status: "DRAFT" },
        update: {},
        select: { id: true, status: true },
      });
      if (period.status === "FINAL") throw new FinalLockError();

      // The series belongs to the period — replace it wholesale.
      await tx.marketAreaStat.deleteMany({ where: { periodId: period.id } });
      await tx.marketAreaStat.createMany({
        data: rows.map((r) => ({
          periodId: period.id,
          statMonth: statMonthToDate(r.month)!, // normalize guarantees a valid key
          propertyRoomNights: r.propertyRoomNights,
          marketRoomNights: r.marketRoomNights,
          propertyAdr: r.propertyAdr,
          marketAdr: r.marketAdr,
        })),
      });
    });

    await logAudit("sales_market_area_save", code, {
      period: input.period,
      months: rows.length,
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, message: `Market Area Update saved — ${rows.length} month(s) for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save the Market Area Update." };
  }
}
