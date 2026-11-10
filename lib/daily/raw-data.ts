/**
 * Read-side RAW data for the Daily Report — exactly what the VHP scraper pushed,
 * before any dashboard calculation. Powers the "Raw Data (VHP)" page so an
 * operator can compare the ingested numbers against their VHP export and see
 * where a figure diverges (e.g. occupancy that still includes Compliment /
 * House Use). Nothing here is derived except occupancy %, which is shown only as
 * a convenience next to the raw Room Occupied ÷ Saleable it comes from.
 */

import { unstable_noStore as noStore } from "next/cache";

import { occupancyPct } from "@/lib/daily/calculations";
import { isMonthId } from "@/lib/daily/pickup-report-data";
import { prisma } from "@/lib/prisma";

const monthShort = (year: number, month: number): string =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
const monthLong = (year: number, month: number): string =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const iso = (d: Date): string => d.toISOString().slice(0, 10);

export interface RawOccCell {
  roomNights: number;
  saleableRooms: number | null;
  occPct: number | null;
  revenue: number | null;
}
export interface RawOccColumn {
  key: string; // yyyy-mm
  label: string; // "Nov"
  stayYear: number;
  stayMonth: number;
}
export interface RawOccRow {
  snapshotDate: string; // yyyy-mm-dd
  day: number;
  cells: (RawOccCell | null)[]; // aligned to occColumns
}
export interface RawPickupRow {
  pickupDate: string;
  agent: string;
  roomNights: number;
  reservations: number | null;
}
export interface RawFlowRow {
  stayDate: string;
  arrivalRooms: number | null;
  departureRooms: number | null;
}
export interface RawPushInfo {
  feed: string; // human label
  at: string; // ISO datetime
  detail: Record<string, unknown> | null;
}
export interface RawDailyData {
  property: { code: string; name: string };
  month: string;
  monthLabel: string;
  occColumns: RawOccColumn[];
  occRows: RawOccRow[]; // newest snapshot first
  latestSnapshotDate: string | null;
  pickups: RawPickupRow[];
  flow: RawFlowRow[];
  pushes: RawPushInfo[];
}

const PUSH_LABEL: Record<string, string> = {
  daily_pickup_import: "Occupancy (Yearly Forecast)",
  daily_reservation_import: "Reservation (pickup + arrivals)",
  daily_departure_import: "Room Departure",
  daily_cancellation_import: "Cancellations",
};

/**
 * Assemble the raw daily feeds for a property + snapshot month. Returns null if
 * the property is unknown or the month id is malformed. Empty feeds yield empty
 * arrays so the page can show a prompt.
 */
export async function getRawDailyData(propertyCode: string, monthId: string): Promise<RawDailyData | null> {
  noStore();
  const code = propertyCode.trim().toUpperCase();
  if (!isMonthId(monthId)) return null;
  const prop = await prisma.property.findUnique({ where: { code }, select: { id: true, code: true, name: true } });
  if (!prop) return null;

  const y = Number(monthId.slice(0, 4));
  const m = Number(monthId.slice(5, 7));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // exclusive

  const [snaps, pickupRows, flowRows, auditRows] = await Promise.all([
    prisma.dailyPickupSnapshot.findMany({
      where: { propertyId: prop.id, snapshotDate: { gte: start, lt: end } },
      select: { snapshotDate: true, stayYear: true, stayMonth: true, roomNights: true, saleableRooms: true, revenue: true },
      orderBy: [{ snapshotDate: "desc" }, { stayYear: "asc" }, { stayMonth: "asc" }],
    }),
    prisma.dailyReservationPickup.findMany({
      where: { propertyId: prop.id, pickupDate: { gte: start, lt: end } },
      select: { pickupDate: true, agent: true, roomNights: true, reservations: true },
      orderBy: [{ pickupDate: "desc" }, { roomNights: "desc" }],
    }),
    prisma.dailyArrivalDeparture.findMany({
      where: { propertyId: prop.id, stayDate: { gte: start, lt: end } },
      select: { stayDate: true, arrivalRooms: true, departureRooms: true },
      orderBy: { stayDate: "asc" },
    }),
    prisma.auditLog.findMany({
      where: { entity: code, action: { in: Object.keys(PUSH_LABEL) } },
      select: { action: true, createdAt: true, detail: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  // Occupancy columns = distinct stay months, chronological (show everything the
  // scraper actually sent — no filtering, this is the raw view).
  const colMap = new Map<string, RawOccColumn>();
  for (const s of snaps) {
    const key = `${s.stayYear}-${String(s.stayMonth).padStart(2, "0")}`;
    if (!colMap.has(key)) {
      colMap.set(key, { key, label: monthShort(s.stayYear, s.stayMonth), stayYear: s.stayYear, stayMonth: s.stayMonth });
    }
  }
  const occColumns = [...colMap.values()].sort((a, b) => a.stayYear - b.stayYear || a.stayMonth - b.stayMonth);

  // Rows keyed by snapshot date (newest first — latest reading at the top).
  const rowMap = new Map<string, Map<string, RawOccCell>>();
  for (const s of snaps) {
    const date = iso(s.snapshotDate);
    const colKey = `${s.stayYear}-${String(s.stayMonth).padStart(2, "0")}`;
    const revenue = s.revenue == null ? null : Number(s.revenue);
    const cells = rowMap.get(date) ?? new Map<string, RawOccCell>();
    cells.set(colKey, {
      roomNights: s.roomNights,
      saleableRooms: s.saleableRooms,
      occPct: occupancyPct(s.roomNights, s.saleableRooms),
      revenue,
    });
    rowMap.set(date, cells);
  }
  const occRows: RawOccRow[] = [...rowMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
    .map(([date, cells]) => ({
      snapshotDate: date,
      day: Number(date.slice(8, 10)),
      cells: occColumns.map((c) => cells.get(c.key) ?? null),
    }));

  const pushes: RawPushInfo[] = auditRows.map((r) => ({
    feed: PUSH_LABEL[r.action] ?? r.action,
    at: r.createdAt.toISOString(),
    detail: r.detail && typeof r.detail === "object" && !Array.isArray(r.detail) ? (r.detail as Record<string, unknown>) : null,
  }));

  return {
    property: { code: prop.code, name: prop.name },
    month: monthId,
    monthLabel: monthLong(y, m),
    occColumns,
    occRows,
    latestSnapshotDate: occRows[0]?.snapshotDate ?? null,
    pickups: pickupRows.map((p) => ({
      pickupDate: iso(p.pickupDate),
      agent: p.agent,
      roomNights: p.roomNights,
      reservations: p.reservations,
    })),
    flow: flowRows.map((f) => ({
      stayDate: iso(f.stayDate),
      arrivalRooms: f.arrivalRooms,
      departureRooms: f.departureRooms,
    })),
    pushes,
  };
}
