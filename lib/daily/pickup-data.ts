/**
 * Read-side summary of stored Occupancy Pickup data — used by the verify
 * endpoint (GET /api/daily/pickup) so an operator can confirm what the scraper's
 * daily pushes actually landed: per snapshot day, the rooms (and revenue) on the
 * books for each stay month, newest first.
 */

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export interface PickupStayMonth {
  stayMonth: string; // yyyy-mm
  roomNights: number;
  revenue: number | null;
}

export interface PickupDaySummary {
  snapshotDate: string; // yyyy-mm-dd
  stayMonths: PickupStayMonth[];
  totalRoomNights: number;
  totalRevenue: number;
}

export interface PickupSummary {
  property: string;
  latestSnapshot: string | null;
  snapshots: PickupDaySummary[];
}

/** Most-recent snapshot days to return by default, to keep the response bounded. */
const MAX_DAYS = 120;

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const isDate = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Summarise stored pickup snapshots for a property, optionally within a
 * snapshot-date range (inclusive, `yyyy-mm-dd`). Returns null if the property is
 * unknown.
 */
export async function getPickupSummary(
  propertyCode: string,
  from?: string,
  to?: string,
): Promise<PickupSummary | null> {
  const code = propertyCode.trim().toUpperCase();
  const prop = await prisma.property.findUnique({ where: { code }, select: { id: true } });
  if (!prop) return null;

  const where: Prisma.DailyPickupSnapshotWhereInput = { propertyId: prop.id };
  const range: Prisma.DateTimeFilter = {};
  if (from && isDate(from)) range.gte = new Date(`${from}T00:00:00.000Z`);
  if (to && isDate(to)) range.lte = new Date(`${to}T00:00:00.000Z`);
  if (range.gte || range.lte) where.snapshotDate = range;

  const rows = await prisma.dailyPickupSnapshot.findMany({
    where,
    select: { snapshotDate: true, stayYear: true, stayMonth: true, roomNights: true, revenue: true },
    orderBy: [{ snapshotDate: "desc" }, { stayYear: "asc" }, { stayMonth: "asc" }],
  });

  const byDate = new Map<string, PickupDaySummary>();
  for (const r of rows) {
    const key = iso(r.snapshotDate);
    const bucket =
      byDate.get(key) ?? { snapshotDate: key, stayMonths: [], totalRoomNights: 0, totalRevenue: 0 };
    const revenue = r.revenue == null ? null : Number(r.revenue);
    bucket.stayMonths.push({
      stayMonth: `${r.stayYear}-${String(r.stayMonth).padStart(2, "0")}`,
      roomNights: r.roomNights,
      revenue,
    });
    bucket.totalRoomNights += r.roomNights;
    bucket.totalRevenue += revenue ?? 0;
    byDate.set(key, bucket);
  }

  // Map preserves insertion order; rows are already snapshotDate-desc.
  const snapshots = [...byDate.values()].slice(0, MAX_DAYS);

  return {
    property: code,
    latestSnapshot: snapshots[0]?.snapshotDate ?? null,
    snapshots,
  };
}
