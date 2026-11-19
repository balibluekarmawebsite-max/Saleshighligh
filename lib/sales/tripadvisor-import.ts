/**
 * Persist the Restaurant "Tripadvisor" listing report into TripadvisorMetrics
 * for one (property, period, unit). The form owns every column on the model, so
 * the upsert writes the whole coerced row. Find-or-create the period (FINAL
 * locked), upsert by (period, unit), audit.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { coerceTripadvisorCore, tripadvisorHasData } from "@/lib/sales/tripadvisor-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;
const UNITS = ["HOTEL", "RESTAURANT", "SPA"] as const;
type Unit = (typeof UNITS)[number];

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface TripadvisorImportInput {
  property: string;
  period: string; // YYYY-MM
  unit?: string;
  core?: unknown; // raw form fields (rating + counts + reported MoM)
  source?: string;
  uploadedBy?: string | null;
}

export interface TripadvisorResult {
  ok: boolean;
  message: string;
}

function normalizeUnit(v: unknown): Unit {
  const s = String(v ?? "").trim().toUpperCase();
  return (UNITS as readonly string[]).includes(s) ? (s as Unit) : "RESTAURANT";
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveTripadvisor(input: TripadvisorImportInput): Promise<TripadvisorResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const unit = normalizeUnit(input.unit);
    const core = coerceTripadvisorCore(input.core);
    if (!tripadvisorHasData(core)) {
      return { ok: false, message: "Nothing to save — enter the rating or at least one metric." };
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

      // The form owns every TripadvisorMetrics column, so a whole-row write is
      // safe (core's field names match the model's exactly).
      await tx.tripadvisorMetrics.upsert({
        where: { periodId_unit: { periodId: period.id, unit } },
        create: { periodId: period.id, unit, ...core },
        update: { ...core },
      });
    });

    await logAudit("sales_restaurant_tripadvisor_save", code, {
      period: input.period,
      unit,
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, message: `Tripadvisor report saved — ${unit} for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save the Tripadvisor report." };
  }
}
