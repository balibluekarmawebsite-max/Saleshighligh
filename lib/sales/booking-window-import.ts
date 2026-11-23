/**
 * Persist the Booking.com "Booking Window" insight into BookingWindowStat for
 * one (property, period). The whole bucket series belongs to the report period,
 * so the save replaces every row for that period (deleteMany + createMany) in
 * one transaction; the report-level metadata is written on each row. Find-or-
 * create the period (FINAL locked), audit.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  bookingWindowHasData,
  normalizeBookingWindowMeta,
  normalizeBookingWindowRows,
  type RawBookingWindowMeta,
  type RawBookingWindowRow,
} from "@/lib/sales/booking-window-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface BookingWindowImportInput {
  property: string;
  period: string; // YYYY-MM
  meta?: RawBookingWindowMeta;
  rows?: unknown; // raw grid rows
  source?: string;
  uploadedBy?: string | null;
}

export interface BookingWindowResult {
  ok: boolean;
  message: string;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveBookingWindow(input: BookingWindowImportInput): Promise<BookingWindowResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const rawRows = Array.isArray(input.rows) ? (input.rows as RawBookingWindowRow[]) : [];
    const rows = normalizeBookingWindowRows(rawRows);
    if (!bookingWindowHasData(rows)) {
      return { ok: false, message: "Nothing to save — enter at least one bucket with a share or ADR." };
    }
    const meta = normalizeBookingWindowMeta(input.meta ?? {});
    const asOf = meta.dataAsOf ? new Date(`${meta.dataAsOf}T00:00:00.000Z`) : null;

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

      await tx.bookingWindowStat.deleteMany({ where: { periodId: period.id } });
      await tx.bookingWindowStat.createMany({
        data: rows.map((r) => ({
          periodId: period.id,
          bucket: r.bucket,
          propertySharePct: r.propertySharePct,
          marketSharePct: r.marketSharePct,
          propertyAdr: r.propertyAdr,
          marketAdr: r.marketAdr,
          windowLabel: meta.windowLabel,
          dataAsOf: asOf,
          totalBookedRooms: meta.totalBookedRooms,
        })),
      });
    });

    await logAudit("sales_booking_window_save", code, {
      period: input.period,
      buckets: rows.length,
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, message: `Booking Window saved — ${rows.length} bucket(s) for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save the Booking Window insight." };
  }
}
