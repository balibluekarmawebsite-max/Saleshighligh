/**
 * Read-side data for the Daily Report's Occupancy Pick-Up page.
 *
 * The scraper posts the Yearly Occupancy export once a day; each push is a
 * snapshot of the rooms on the books for every forward stay month. This assembles
 * those snapshots into the report grid: rows = snapshot dates within a month,
 * columns = stay months, cells = occupancy on hand. The summary row per column
 * (Occ on Hand / Room Sold / ADR / Revenue from the latest reading, plus
 * Increasement % and Average Pickup/day) is computed in lib/daily/calculations.
 */

import { unstable_noStore as noStore } from "next/cache";

import {
  occupancyPct,
  stayMonthPickup,
  type PickupPoint,
} from "@/lib/daily/calculations";
import { type PropertyOption } from "@/lib/dashboard-data";
import { prisma } from "@/lib/prisma";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** True for a valid `yyyy-mm` snapshot-month id. */
export function isMonthId(s: string): boolean {
  if (!MONTH_RE.test(s)) return false;
  const m = Number(s.slice(5, 7));
  return m >= 1 && m <= 12;
}

// Labels are pinned to UTC so they match the yyyy-mm id regardless of the
// server's local timezone (a server behind UTC would otherwise render the 1st
// of a month as the previous month).
const monthShort = (year: number, month: number): string =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
const monthLong = (year: number, month: number): string =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export interface DailyMonthOption {
  month: string; // yyyy-mm (the snapshot month)
  label: string; // "October 2026"
  snapshots: number; // distinct snapshot days recorded
}

export interface DailyShellData {
  properties: PropertyOption[];
  monthsByProperty: Record<string, DailyMonthOption[]>;
}

/** Properties + the snapshot months that have pickup data, for the Daily shell. */
export async function getDailyShellData(): Promise<DailyShellData> {
  noStore();
  const [props, snaps] = await Promise.all([
    prisma.property.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.dailyPickupSnapshot.findMany({
      distinct: ["propertyId", "snapshotDate"],
      select: { propertyId: true, snapshotDate: true },
    }),
  ]);

  const idToCode = new Map(props.map((p) => [p.id, p.code]));
  const seen = new Map<string, Map<string, number>>(); // code -> (month -> count)
  for (const s of snaps) {
    const code = idToCode.get(s.propertyId);
    if (!code) continue;
    const month = s.snapshotDate.toISOString().slice(0, 7);
    const byMonth = seen.get(code) ?? new Map<string, number>();
    byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    seen.set(code, byMonth);
  }

  const monthsByProperty: Record<string, DailyMonthOption[]> = {};
  for (const [code, byMonth] of seen) {
    monthsByProperty[code] = [...byMonth.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
      .map(([month, count]) => ({
        month,
        label: monthLong(Number(month.slice(0, 4)), Number(month.slice(5, 7))),
        snapshots: count,
      }));
  }

  return { properties: props.map(({ code, name }) => ({ code, name })), monthsByProperty };
}

export interface PickupColumn {
  key: string; // "yyyy-mm" (stay month)
  stayYear: number;
  stayMonth: number;
  label: string; // "Oct"
}

export interface PickupCell {
  occPct: number | null;
  roomNights: number;
  revenue: number | null;
}

export interface PickupReportRow {
  snapshotDate: string; // yyyy-mm-dd
  day: number; // day of month (1-31)
  cells: (PickupCell | null)[]; // aligned to columns; null = that stay month absent that day
}

export interface PickupColumnSummary {
  key: string; // stay-month key (aligns to columns)
  occOnHand: number | null;
  roomSold: number;
  revenue: number | null;
  adr: number | null;
  increasementPct: number | null;
  avgPickupPerDay: number | null;
}

export interface PickupReport {
  property: PropertyOption;
  month: string; // yyyy-mm
  monthLabel: string; // "October 2026"
  columns: PickupColumn[];
  rows: PickupReportRow[];
  summaries: PickupColumnSummary[]; // aligned to columns
}

/**
 * Assemble the Occupancy Pick-Up grid for a property + snapshot month. Returns
 * null if the property is unknown or the month id is malformed. Empty (no
 * snapshots) yields a report with no columns/rows so the page can show a prompt.
 */
export async function getPickupReport(propertyCode: string, monthId: string): Promise<PickupReport | null> {
  noStore();
  const code = propertyCode.trim().toUpperCase();
  if (!isMonthId(monthId)) return null;
  const prop = await prisma.property.findUnique({ where: { code }, select: { id: true, code: true, name: true } });
  if (!prop) return null;

  const y = Number(monthId.slice(0, 4));
  const m = Number(monthId.slice(5, 7));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // exclusive upper bound

  const snaps = await prisma.dailyPickupSnapshot.findMany({
    where: { propertyId: prop.id, snapshotDate: { gte: start, lt: end } },
    select: { snapshotDate: true, stayYear: true, stayMonth: true, roomNights: true, saleableRooms: true, revenue: true },
    orderBy: [{ snapshotDate: "asc" }, { stayYear: "asc" }, { stayMonth: "asc" }],
  });

  // Columns = distinct stay months, chronological.
  const colMap = new Map<string, PickupColumn>();
  for (const s of snaps) {
    const key = `${s.stayYear}-${String(s.stayMonth).padStart(2, "0")}`;
    if (!colMap.has(key)) {
      colMap.set(key, { key, stayYear: s.stayYear, stayMonth: s.stayMonth, label: monthShort(s.stayYear, s.stayMonth) });
    }
  }
  // Only show the snapshot month and the months ahead of it. (The live Yearly
  // Occupancy export starts at the current month; some backfilled manual tabs
  // carried a prior-month column, which we drop here so e.g. the September
  // report doesn't show an August column.)
  const snapIdx = y * 12 + (m - 1);
  const columns = [...colMap.values()]
    .filter((c) => c.stayYear * 12 + (c.stayMonth - 1) >= snapIdx)
    .sort((a, b) => a.stayYear - b.stayYear || a.stayMonth - b.stayMonth);

  // Rows (by snapshot date) + per-column series (for the summary rows).
  const rowMap = new Map<string, Map<string, PickupCell>>();
  const colSeries = new Map<string, PickupPoint[]>();
  for (const s of snaps) {
    const date = s.snapshotDate.toISOString().slice(0, 10);
    const colKey = `${s.stayYear}-${String(s.stayMonth).padStart(2, "0")}`;
    const revenue = s.revenue == null ? null : Number(s.revenue);

    const rowCells = rowMap.get(date) ?? new Map<string, PickupCell>();
    rowCells.set(colKey, { occPct: occupancyPct(s.roomNights, s.saleableRooms), roomNights: s.roomNights, revenue });
    rowMap.set(date, rowCells);

    const series = colSeries.get(colKey) ?? [];
    series.push({ snapshotDate: date, roomNights: s.roomNights, saleableRooms: s.saleableRooms, revenue });
    colSeries.set(colKey, series);
  }

  const rows: PickupReportRow[] = [...rowMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, cells]) => ({
      snapshotDate: date,
      day: Number(date.slice(8, 10)),
      cells: columns.map((c) => cells.get(c.key) ?? null),
    }));

  const summaries: PickupColumnSummary[] = columns.map((c) => {
    const sm = stayMonthPickup(colSeries.get(c.key) ?? []);
    return {
      key: c.key,
      occOnHand: sm.occOnHand,
      roomSold: sm.roomSold,
      revenue: sm.revenue,
      adr: sm.adr,
      increasementPct: sm.increasementPct,
      avgPickupPerDay: sm.avgPickupPerDay,
    };
  });

  return {
    property: { code: prop.code, name: prop.name },
    month: monthId,
    monthLabel: monthLong(y, m),
    columns,
    rows,
    summaries,
  };
}
