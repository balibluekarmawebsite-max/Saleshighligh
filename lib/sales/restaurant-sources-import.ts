/**
 * Persist Restaurant "Source of Booking" rows (per-source persons + revenue)
 * into FnbSourceOfBooking for one (property, period). Find-or-create the period
 * (FINAL locked), upsert one row per source, prune sources no longer present,
 * and audit. The "%" share and average check are derived on read.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeSourceRows, type RawSourceRow } from "@/lib/sales/restaurant-sources-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface SourcesImportInput {
  property: string;
  period: string; // YYYY-MM
  sources: RawSourceRow[];
  source?: string;
  uploadedBy?: string | null;
}

export interface SourcesResult {
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

export async function saveSources(input: SourcesImportInput): Promise<SourcesResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const { rows } = normalizeSourceRows(input.sources ?? []);
    if (rows.length === 0) return { ok: false, message: "No valid source rows (need a name + persons + revenue)." };

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

      // The submitted grid is authoritative for the period: a source no longer
      // present is removed, so stale rows can't corrupt the totals / mix.
      await tx.fnbSourceOfBooking.deleteMany({
        where: { periodId: period.id, sourceName: { notIn: rows.map((r) => r.sourceName) } },
      });

      for (const r of rows) {
        await tx.fnbSourceOfBooking.upsert({
          where: { periodId_sourceName: { periodId: period.id, sourceName: r.sourceName } },
          create: { periodId: period.id, sourceName: r.sourceName, persons: r.persons, revenue: r.revenue },
          update: { persons: r.persons, revenue: r.revenue },
        });
      }
    });

    await logAudit("sales_restaurant_sources_save", code, {
      period: input.period,
      sources: rows.map((r) => r.sourceName),
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, saved: rows.length, message: `Source of booking saved — ${rows.length} source(s) for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save source of booking." };
  }
}
