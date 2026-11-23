/**
 * Persist Spa "Guest Segment Performance" rows (per-segment covers + revenue,
 * actual + budget) into SpaSales for one (property, period). Find-or-create the
 * period (FINAL locked), upsert one row per guest segment, prune segments no
 * longer present, and audit. The average check, "%" shares and variance are
 * derived on read.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeSpaPerf, type RawSpaPerfRow } from "@/lib/sales/spa-performance-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface SpaPerfImportInput {
  property: string;
  period: string; // YYYY-MM
  segments: RawSpaPerfRow[];
  source?: string;
  uploadedBy?: string | null;
}

export interface SpaPerfResult {
  ok: boolean;
  message: string;
  saved?: number;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveSpaPerformance(input: SpaPerfImportInput): Promise<SpaPerfResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const rows = normalizeSpaPerf(input.segments ?? []);
    if (rows.length === 0) {
      return { ok: false, message: "No valid guest-segment rows (need covers or revenue for at least one segment)." };
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

      // The submitted grid is authoritative for the period: a segment no longer
      // present is removed, so stale rows can't corrupt the totals / KPIs.
      await tx.spaSales.deleteMany({
        where: { periodId: period.id, guestSegment: { notIn: rows.map((r) => r.segment) } },
      });

      for (const r of rows) {
        await tx.spaSales.upsert({
          where: { periodId_guestSegment: { periodId: period.id, guestSegment: r.segment } },
          create: {
            periodId: period.id,
            guestSegment: r.segment,
            coversActual: r.coversActual,
            coversBudget: r.coversBudget,
            revenueActual: r.revenueActual,
            revenueBudget: r.revenueBudget,
          },
          update: {
            coversActual: r.coversActual,
            coversBudget: r.coversBudget,
            revenueActual: r.revenueActual,
            revenueBudget: r.revenueBudget,
          },
        });
      }
    });

    await logAudit("sales_spa_performance_save", code, {
      period: input.period,
      segments: rows.map((r) => r.segment),
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, saved: rows.length, message: `Spa performance saved — ${rows.length} segment(s) for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save spa performance." };
  }
}
