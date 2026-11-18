/**
 * Persist the Restaurant "Chope Reservations" report for one (property, period):
 *   - the scalar parts (funnel + revenue + sources) → the single ChopeReport row
 *   - the daily online bookings → ChopeDaily (replaced only when submitted)
 * Find-or-create the period (FINAL locked), audit. The form holds every scalar
 * field (seeded from the stored row when editing), so the upsert writes the
 * whole row and a partial re-upload never drops the other parts.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { coerceChopeCore, normalizeChopeDaily, type RawChopeDailyRow } from "@/lib/sales/chope-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface ChopeImportInput {
  property: string;
  period: string; // YYYY-MM
  core?: unknown; // raw scalar fields (funnel + revenue + sources)
  daily?: RawChopeDailyRow[];
  source?: string;
  uploadedBy?: string | null;
}

export interface ChopeResult {
  ok: boolean;
  message: string;
  savedDaily?: number;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveChope(input: ChopeImportInput): Promise<ChopeResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const core = coerceChopeCore(input.core);
    const { rows: daily } = normalizeChopeDaily(input.daily ?? []);

    const coreHasData =
      core.revenue > 0 ||
      core.revenuePct != null ||
      core.fulfilledBookings > 0 ||
      core.fulfilledCovers > 0 ||
      core.cancelledBookings > 0 ||
      core.cancelledCovers > 0 ||
      core.noShows > 0 ||
      core.noShowCovers > 0 ||
      core.upcomingBookings > 0 ||
      core.upcomingCovers > 0 ||
      core.walkinBookings > 0 ||
      core.walkinCovers > 0 ||
      core.platformBookings > 0 ||
      core.platformCovers > 0 ||
      core.directBookings > 0 ||
      core.directCovers > 0;

    if (!coreHasData && daily.length === 0) {
      return { ok: false, message: "Nothing to save — fill the traffic / revenue / sources figures or the daily table." };
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

      // Scalar report row — write the whole (merged) set when there is any data.
      if (coreHasData) {
        await tx.chopeReport.upsert({
          where: { periodId: period.id },
          create: { periodId: period.id, ...core },
          update: { ...core },
        });
      }

      // Daily series — replace only when submitted.
      if (daily.length > 0) {
        await tx.chopeDaily.deleteMany({
          where: { periodId: period.id, day: { notIn: daily.map((d) => d.day) } },
        });
        for (const d of daily) {
          await tx.chopeDaily.upsert({
            where: { periodId_day: { periodId: period.id, day: d.day } },
            create: { periodId: period.id, day: d.day, platformBookings: d.platformBookings, directBookings: d.directBookings },
            update: { platformBookings: d.platformBookings, directBookings: d.directBookings },
          });
        }
      }
    });

    await logAudit("sales_restaurant_chope_save", code, {
      period: input.period,
      hasCore: coreHasData,
      dailyDays: daily.length,
      source: input.source ?? null,
    }).catch(() => {});

    const parts: string[] = [];
    if (coreHasData) parts.push("report");
    if (daily.length > 0) parts.push(`${daily.length} day(s)`);
    return { ok: true, savedDaily: daily.length, message: `Chope report saved — ${parts.join(" + ")} for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save the Chope report." };
  }
}
