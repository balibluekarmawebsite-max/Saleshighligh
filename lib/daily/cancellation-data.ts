/**
 * Read-side summary of stored Cancellation Report data — used by the verify
 * endpoint (GET /api/daily/cancellation) so an operator can confirm what the
 * scraper's pushes actually landed, with the same-day exclusion applied.
 */

import { Prisma } from "@prisma/client";

import {
  cancellationRoomNights,
  sameDayCancellationRoomNights,
  type CancellationLike,
} from "@/lib/daily/calculations";
import { prisma } from "@/lib/prisma";

export interface CancellationDaySummary {
  cancelDate: string; // ISO yyyy-mm-dd
  lines: number;
  /** Counted cancellation room nights (same-day book-and-cancel excluded). */
  roomNights: number;
  /** Same-day book-and-cancel room nights (stored but excluded from the report). */
  sameDayRoomNights: number;
}

export interface CancellationSummary {
  property: string;
  totals: { lines: number; roomNights: number; sameDayRoomNights: number };
  byDate: CancellationDaySummary[];
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const isDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Summarise stored cancellations for a property, optionally within a cancel-date
 * range (inclusive, `yyyy-mm-dd`). Returns null if the property is unknown.
 */
export async function getCancellationSummary(
  propertyCode: string,
  from?: string,
  to?: string,
): Promise<CancellationSummary | null> {
  const code = propertyCode.trim().toUpperCase();
  const prop = await prisma.property.findUnique({ where: { code }, select: { id: true } });
  if (!prop) return null;

  const where: Prisma.DailyCancellationWhereInput = { propertyId: prop.id };
  const range: Prisma.DateTimeFilter = {};
  if (from && isDate(from)) range.gte = new Date(`${from}T00:00:00.000Z`);
  if (to && isDate(to)) range.lte = new Date(`${to}T00:00:00.000Z`);
  if (range.gte || range.lte) where.cancelDate = range;

  const rows = await prisma.dailyCancellation.findMany({
    where,
    select: { cancelDate: true, createdDate: true, nights: true, roomQuantity: true },
    orderBy: { cancelDate: "desc" },
  });

  const lines: CancellationLike[] = rows.map((r) => ({
    cancelDate: iso(r.cancelDate),
    createdDate: iso(r.createdDate),
    nights: r.nights,
    roomQuantity: r.roomQuantity,
  }));

  const byDateMap = new Map<string, CancellationLike[]>();
  for (const l of lines) {
    const bucket = byDateMap.get(l.cancelDate) ?? [];
    bucket.push(l);
    byDateMap.set(l.cancelDate, bucket);
  }

  const byDate: CancellationDaySummary[] = [...byDateMap.entries()]
    .map(([cancelDate, ls]) => ({
      cancelDate,
      lines: ls.length,
      roomNights: cancellationRoomNights(ls),
      sameDayRoomNights: sameDayCancellationRoomNights(ls),
    }))
    .sort((a, b) => (a.cancelDate < b.cancelDate ? 1 : -1));

  return {
    property: code,
    totals: {
      lines: lines.length,
      roomNights: cancellationRoomNights(lines),
      sameDayRoomNights: sameDayCancellationRoomNights(lines),
    },
    byDate,
  };
}
