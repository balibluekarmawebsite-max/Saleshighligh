/**
 * Persist the Sojern "Market Overview" for one (property, period): one
 * SojernOverview metadata row (upsert by periodId) plus the flight/hotel index
 * points (deleteMany + createMany), in one transaction. Find-or-create the
 * period (FINAL locked), audit.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  normalizeSojernMeta,
  normalizeSojernPoints,
  sojernHasData,
  type RawSojernMeta,
  type RawSojernPoint,
} from "@/lib/sales/sojern-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface SojernImportInput {
  property: string;
  period: string; // YYYY-MM
  meta?: RawSojernMeta;
  points?: unknown;
  source?: string;
  uploadedBy?: string | null;
}

export interface SojernResult {
  ok: boolean;
  message: string;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveSojern(input: SojernImportInput): Promise<SojernResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const rawPoints = Array.isArray(input.points) ? (input.points as RawSojernPoint[]) : [];
    const points = normalizeSojernPoints(rawPoints);
    if (!sojernHasData(points)) {
      return { ok: false, message: "Nothing to save — enter at least one flight or hotel index value." };
    }
    const meta = normalizeSojernMeta(input.meta ?? {});

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

      await tx.sojernOverview.upsert({
        where: { periodId: period.id },
        create: { periodId: period.id, ...meta },
        update: meta,
      });

      await tx.sojernIndexPoint.deleteMany({ where: { periodId: period.id } });
      await tx.sojernIndexPoint.createMany({
        data: points.map((p) => ({
          periodId: period.id,
          metric: p.metric,
          year: p.year,
          month: p.month,
          valuePct: p.valuePct,
        })),
      });
    });

    await logAudit("sales_sojern_save", code, {
      period: input.period,
      points: points.length,
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, message: `Sojern Market Overview saved — ${points.length} point(s) for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save the Sojern Market Overview." };
  }
}
