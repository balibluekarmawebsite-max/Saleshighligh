/**
 * Persist the Booking.com "Overview" (Search Performance) for one (property,
 * period): one BookingOverview row (upsert by periodId) plus the monthly
 * availability trend (deleteMany + createMany), in one transaction. Find-or-
 * create the period (FINAL locked), audit.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  bookingOverviewHasData,
  coerceBookingOverviewCore,
  normalizeAvailRows,
  type RawAvailRow,
} from "@/lib/sales/booking-overview-logic";
import { statMonthToDate } from "@/lib/sales/market-area-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface BookingOverviewImportInput {
  property: string;
  period: string; // YYYY-MM
  core?: unknown; // raw scalar fields
  avail?: unknown; // raw monthly availability rows
  source?: string;
  uploadedBy?: string | null;
}

export interface BookingOverviewResult {
  ok: boolean;
  message: string;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveBookingOverview(input: BookingOverviewImportInput): Promise<BookingOverviewResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const core = coerceBookingOverviewCore(input.core);
    if (!bookingOverviewHasData(core)) {
      return { ok: false, message: "Nothing to save — enter at least the search views, bookings or availability." };
    }
    const availRows = Array.isArray(input.avail) ? (input.avail as RawAvailRow[]) : [];
    const avail = normalizeAvailRows(availRows);
    const asOf = core.dataAsOf ? new Date(`${core.dataAsOf}T00:00:00.000Z`) : null;
    const { windowLabel, dataAsOf: _drop, ...scalars } = core;
    void _drop;

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

      const data = { ...scalars, windowLabel, dataAsOf: asOf };
      await tx.bookingOverview.upsert({
        where: { periodId: period.id },
        create: { periodId: period.id, ...data },
        update: data,
      });

      await tx.bookingOverviewAvail.deleteMany({ where: { periodId: period.id } });
      if (avail.length > 0) {
        await tx.bookingOverviewAvail.createMany({
          data: avail.map((r) => ({
            periodId: period.id,
            statMonth: statMonthToDate(r.month)!, // normalize guarantees a valid key
            yourPct: r.yourPct,
            marketPct: r.marketPct,
          })),
        });
      }
    });

    await logAudit("sales_booking_overview_save", code, {
      period: input.period,
      availMonths: avail.length,
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, message: `Booking.com Overview saved for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save the Booking.com Overview." };
  }
}
