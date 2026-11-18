/**
 * Persist the Restaurant "Gokai CRM" report into GokaiReport for one
 * (property, period, unit). The form holds the six metrics + the reported MoM
 * (percentages as entered); coerceGokaiCore converts rates to ratios on save.
 * Find-or-create the period (FINAL locked), upsert by (period, unit), audit.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { coerceGokaiCore, gokaiHasData, normalizeGokaiUnit, type GokaiUnit } from "@/lib/sales/gokai-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface GokaiImportInput {
  property: string;
  period: string; // YYYY-MM
  unit?: string;
  core?: unknown; // raw form fields (metrics + MoM, percentages as entered)
  source?: string;
  uploadedBy?: string | null;
}

export interface GokaiResult {
  ok: boolean;
  message: string;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveGokai(input: GokaiImportInput): Promise<GokaiResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const unit: GokaiUnit = normalizeGokaiUnit(input.unit);
    const core = coerceGokaiCore(input.core);
    if (!gokaiHasData(core)) {
      return { ok: false, message: "Nothing to save — fill in at least one Gokai metric." };
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

      await tx.gokaiReport.upsert({
        where: { periodId_unit: { periodId: period.id, unit } },
        create: { periodId: period.id, unit, ...core },
        update: { ...core },
      });
    });

    await logAudit("sales_restaurant_gokai_save", code, {
      period: input.period,
      unit,
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, message: `Gokai report saved — ${unit} for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save the Gokai report." };
  }
}
