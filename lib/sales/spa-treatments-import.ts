/**
 * Persist Spa "Top Treatments" rows (per-treatment count + revenue) into
 * SpaTreatment for one (property, period). Find-or-create the period (FINAL
 * locked), upsert one row per treatment, prune treatments no longer present,
 * and audit. The "%" share and average check are derived on read.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeTreatmentRows, type RawTreatmentRow } from "@/lib/sales/spa-treatments-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface TreatmentsImportInput {
  property: string;
  period: string; // YYYY-MM
  treatments: RawTreatmentRow[];
  source?: string;
  uploadedBy?: string | null;
}

export interface TreatmentsResult {
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

export async function saveSpaTreatments(input: TreatmentsImportInput): Promise<TreatmentsResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const { rows } = normalizeTreatmentRows(input.treatments ?? []);
    if (rows.length === 0) return { ok: false, message: "No valid treatment rows (need a name + count + revenue)." };

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

      // The submitted grid is authoritative for the period: a treatment no
      // longer present is removed, so stale rows can't corrupt the totals / mix.
      await tx.spaTreatment.deleteMany({
        where: { periodId: period.id, treatmentName: { notIn: rows.map((r) => r.treatmentName) } },
      });

      for (const r of rows) {
        await tx.spaTreatment.upsert({
          where: { periodId_treatmentName: { periodId: period.id, treatmentName: r.treatmentName } },
          create: { periodId: period.id, treatmentName: r.treatmentName, treatmentCount: r.count, revenue: r.revenue },
          update: { treatmentCount: r.count, revenue: r.revenue },
        });
      }
    });

    await logAudit("sales_spa_treatments_save", code, {
      period: input.period,
      treatments: rows.map((r) => r.treatmentName),
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, saved: rows.length, message: `Top treatments saved — ${rows.length} treatment(s) for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save spa treatments." };
  }
}
