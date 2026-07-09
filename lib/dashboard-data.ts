import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";

/**
 * Server-side data access for the dashboard. Reads RAW rows from Postgres and
 * shapes them into plain-number view models (Prisma `Decimal` → `number`) so
 * client chart components receive serializable data. Derived metrics are left
 * to lib/calculations at render time.
 */

export interface MetricAB {
  actual: number;
  budget: number;
}

export interface DepartmentRow {
  department: string;
  label: string;
  actual: number;
  budget: number;
}

export interface SegmentRow {
  segmentName: string;
  actualRoomNights: number;
  budgetRoomNights: number;
  actualRevenue: number;
  budgetRevenue: number;
}

export interface ExecutiveSummary {
  property: {
    code: string;
    name: string;
    area: string;
    roomCount: number;
    restaurantName: string;
    spaName: string;
  };
  period: Date | null;
  status: string | null;
  occupancy: MetricAB | null;
  adr: MetricAB | null;
  revpar: MetricAB | null;
  totalRevenue: MetricAB | null;
  departments: DepartmentRow[];
  segments: SegmentRow[];
}

const DEPARTMENT_LABELS: Record<string, string> = {
  ROOM_REVENUE: "Rooms",
  FNB: "Food & Beverage",
  SPA_WELLNESS: "Spa & Wellness",
  GALLERY: "Gallery",
  OOD: "Other Operating",
  TOTAL_REVENUE: "Total Revenue",
};

/** Revenue departments shown in the breakdown (Total is summarised separately). */
const REVENUE_DEPARTMENTS = [
  "ROOM_REVENUE",
  "FNB",
  "SPA_WELLNESS",
  "GALLERY",
  "OOD",
] as const;

export interface PropertyOption {
  code: string;
  name: string;
}

/** All properties, for the dashboard switcher. */
export async function getProperties(): Promise<PropertyOption[]> {
  noStore();
  const properties = await prisma.property.findMany({
    orderBy: { code: "asc" },
    select: { code: true, name: true },
  });
  return properties;
}

/** Resolve a requested property code to a valid one, falling back sensibly. */
export function resolveActiveCode(
  properties: PropertyOption[],
  requested: string | string[] | undefined,
): string {
  const code = typeof requested === "string" ? requested : undefined;
  return (
    properties.find((p) => p.code === code)?.code ??
    properties[0]?.code ??
    "BKDS"
  );
}

export const GROUP_CODE = "GROUP";

/** "2026-06" → Date at UTC midnight of the first of that month. */
export function periodToDate(period: string): Date {
  return new Date(`${period}-01T00:00:00.000Z`);
}

/** Date → "2026-06". */
export function dateToPeriod(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export interface PeriodOption {
  period: string; // "yyyy-mm"
  status: string;
}

/** The report periods that exist for a property (newest first). */
export async function getPropertyPeriods(
  propertyCode: string,
): Promise<PeriodOption[]> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    select: {
      periods: { orderBy: { period: "desc" }, select: { period: true, status: true } },
    },
  });
  return (
    property?.periods.map((p) => ({
      period: dateToPeriod(p.period),
      status: p.status,
    })) ?? []
  );
}

export interface ShellData {
  properties: PropertyOption[];
  periodsByProperty: Record<string, PeriodOption[]>;
  defaultPath: string;
}

/** Everything the persistent shell (sidebar + context bar) needs, in one query. */
export async function getShellData(): Promise<ShellData> {
  noStore();
  const properties = await prisma.property.findMany({
    orderBy: { code: "asc" },
    select: {
      code: true,
      name: true,
      periods: { orderBy: { period: "desc" }, select: { period: true, status: true } },
    },
  });

  const periodsByProperty: Record<string, PeriodOption[]> = {};
  for (const p of properties) {
    periodsByProperty[p.code] = p.periods.map((rp) => ({
      period: dateToPeriod(rp.period),
      status: rp.status,
    }));
  }

  // Default: first property that has data, at its latest period.
  let defaultPath = "/admin/import";
  const withData = properties.find((p) => p.periods.length > 0);
  if (withData) {
    defaultPath = `/dashboard/${withData.code}/${dateToPeriod(withData.periods[0]!.period)}`;
  }

  return {
    properties: properties.map((p) => ({ code: p.code, name: p.name })),
    periodsByProperty,
    defaultPath,
  };
}

/**
 * Executive summary for a property's most recent report period. Returns `null`
 * if the property code is unknown.
 */
export async function getExecutiveSummary(
  propertyCode: string,
  period?: string,
): Promise<ExecutiveSummary | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: period ? { period: periodToDate(period) } : undefined,
        orderBy: { period: "desc" },
        take: 1,
        include: {
          revenueSummaries: true,
          segmentProduction: { where: { scope: "MTD" } },
        },
      },
    },
  });

  if (!property) return null;

  const base = {
    property: {
      code: property.code,
      name: property.name,
      area: property.area,
      roomCount: property.roomCount,
      restaurantName: property.restaurantName,
      spaName: property.spaName,
    },
  };

  const rp = property.periods[0];
  if (!rp) {
    return {
      ...base,
      period: null,
      status: null,
      occupancy: null,
      adr: null,
      revpar: null,
      totalRevenue: null,
      departments: [],
      segments: [],
    };
  }

  // Index revenue lines by department.
  const byDept = new Map<string, MetricAB>();
  for (const row of rp.revenueSummaries) {
    byDept.set(row.department, {
      actual: row.actual.toNumber(),
      budget: row.budget.toNumber(),
    });
  }

  const departments: DepartmentRow[] = REVENUE_DEPARTMENTS.filter((d) =>
    byDept.has(d),
  ).map((d) => ({
    department: d,
    label: DEPARTMENT_LABELS[d] ?? d,
    actual: byDept.get(d)!.actual,
    budget: byDept.get(d)!.budget,
  }));

  // Fold segment rows (ACTUAL/BUDGET) into one row per segment.
  const segMap = new Map<string, SegmentRow>();
  for (const row of rp.segmentProduction) {
    const existing =
      segMap.get(row.segmentName) ??
      ({
        segmentName: row.segmentName,
        actualRoomNights: 0,
        budgetRoomNights: 0,
        actualRevenue: 0,
        budgetRevenue: 0,
      } satisfies SegmentRow);
    if (row.series === "ACTUAL") {
      existing.actualRoomNights = row.roomNights;
      existing.actualRevenue = row.roomRevenue.toNumber();
    } else if (row.series === "BUDGET") {
      existing.budgetRoomNights = row.roomNights;
      existing.budgetRevenue = row.roomRevenue.toNumber();
    }
    segMap.set(row.segmentName, existing);
  }
  const segments = [...segMap.values()].sort(
    (a, b) =>
      Math.max(b.actualRevenue, b.budgetRevenue) -
      Math.max(a.actualRevenue, a.budgetRevenue),
  );

  return {
    ...base,
    period: rp.period,
    status: rp.status,
    occupancy: byDept.get("OCCUPANCY") ?? null,
    adr: byDept.get("ADR") ?? null,
    revpar: byDept.get("REVPAR") ?? null,
    totalRevenue: byDept.get("TOTAL_REVENUE") ?? null,
    departments,
    segments,
  };
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

export interface RoomTypeRow {
  roomTypeName: string;
  roomNightsActual: number;
  roomNightsBudget: number;
  adrActual: number;
  adrBudget: number;
  revenueActual: number;
  revenueBudget: number;
}

export interface NationalityRow {
  rank: number;
  countryName: string;
  countryCode: string | null;
  roomNights: number;
}

export interface LosRow {
  losBucket: string;
  bookings: number;
  roomNights: number;
}

export interface AccountRow {
  accountName: string;
  accountType: string;
  roomNights: number;
  revenue: number;
}

export interface RoomsSummary {
  property: { code: string; name: string; area: string; roomCount: number };
  period: Date | null;
  segments: SegmentRow[];
  roomTypes: RoomTypeRow[];
  nationalities: NationalityRow[];
  lengthOfStay: LosRow[];
  accounts: AccountRow[];
}

const LOS_ORDER = ["1", "2", "3", "4", "5", "6", "7+"];

/** Rooms analytics for a property's most recent report period. */
export async function getRoomsSummary(
  propertyCode: string,
  period?: string,
  scope: "MTD" | "YTD" = "MTD",
): Promise<RoomsSummary | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: period ? { period: periodToDate(period) } : undefined,
        orderBy: { period: "desc" },
        take: 1,
        include: {
          segmentProduction: { where: { scope } },
          roomTypeProduction: true,
          nationality: { where: { scope }, orderBy: { roomNights: "desc" } },
          lengthOfStay: true,
          accountProduction: { orderBy: { revenue: "desc" } },
        },
      },
    },
  });

  if (!property) return null;

  const base = {
    property: {
      code: property.code,
      name: property.name,
      area: property.area,
      roomCount: property.roomCount,
    },
  };

  const rp = property.periods[0];
  if (!rp) {
    return {
      ...base,
      period: null,
      segments: [],
      roomTypes: [],
      nationalities: [],
      lengthOfStay: [],
      accounts: [],
    };
  }

  // Segments (fold ACTUAL/BUDGET into one row).
  const segMap = new Map<string, SegmentRow>();
  for (const row of rp.segmentProduction) {
    const existing =
      segMap.get(row.segmentName) ??
      ({
        segmentName: row.segmentName,
        actualRoomNights: 0,
        budgetRoomNights: 0,
        actualRevenue: 0,
        budgetRevenue: 0,
      } satisfies SegmentRow);
    if (row.series === "ACTUAL") {
      existing.actualRoomNights = row.roomNights;
      existing.actualRevenue = row.roomRevenue.toNumber();
    } else if (row.series === "BUDGET") {
      existing.budgetRoomNights = row.roomNights;
      existing.budgetRevenue = row.roomRevenue.toNumber();
    }
    segMap.set(row.segmentName, existing);
  }
  const segments = [...segMap.values()].sort(
    (a, b) =>
      Math.max(b.actualRevenue, b.budgetRevenue) -
      Math.max(a.actualRevenue, a.budgetRevenue),
  );

  const roomTypes: RoomTypeRow[] = rp.roomTypeProduction
    .map((r) => ({
      roomTypeName: r.roomTypeName,
      roomNightsActual: r.roomNightsActual,
      roomNightsBudget: r.roomNightsBudget,
      adrActual: r.adrActual.toNumber(),
      adrBudget: r.adrBudget.toNumber(),
      revenueActual: r.revenueActual.toNumber(),
      revenueBudget: r.revenueBudget.toNumber(),
    }))
    .sort((a, b) => b.revenueActual - a.revenueActual);

  const nationalities: NationalityRow[] = rp.nationality.map((n, i) => ({
    rank: i + 1,
    countryName: n.countryName,
    countryCode: n.countryCode,
    roomNights: n.roomNights,
  }));

  const lengthOfStay: LosRow[] = [...rp.lengthOfStay]
    .sort(
      (a, b) => LOS_ORDER.indexOf(a.losBucket) - LOS_ORDER.indexOf(b.losBucket),
    )
    .map((l) => ({
      losBucket: l.losBucket,
      bookings: l.bookings,
      roomNights: l.roomNights,
    }));

  const accounts: AccountRow[] = rp.accountProduction.map((a) => ({
    accountName: a.accountName,
    accountType: a.accountType,
    roomNights: a.roomNights,
    revenue: a.revenue.toNumber(),
  }));

  return {
    ...base,
    period: rp.period,
    segments,
    roomTypes,
    nationalities,
    lengthOfStay,
    accounts,
  };
}
