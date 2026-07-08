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

/**
 * Executive summary for a property's most recent report period. Returns `null`
 * if the property code is unknown.
 */
export async function getExecutiveSummary(
  propertyCode: string,
): Promise<ExecutiveSummary | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
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

  const period = property.periods[0];
  if (!period) {
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
  for (const row of period.revenueSummaries) {
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
  for (const row of period.segmentProduction) {
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
    period: period.period,
    status: period.status,
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
): Promise<RoomsSummary | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        orderBy: { period: "desc" },
        take: 1,
        include: {
          segmentProduction: { where: { scope: "MTD" } },
          roomTypeProduction: true,
          nationality: { where: { scope: "MTD" }, orderBy: { roomNights: "desc" } },
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

  const period = property.periods[0];
  if (!period) {
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
  for (const row of period.segmentProduction) {
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

  const roomTypes: RoomTypeRow[] = period.roomTypeProduction
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

  const nationalities: NationalityRow[] = period.nationality.map((n, i) => ({
    rank: i + 1,
    countryName: n.countryName,
    countryCode: n.countryCode,
    roomNights: n.roomNights,
  }));

  const lengthOfStay: LosRow[] = [...period.lengthOfStay]
    .sort(
      (a, b) => LOS_ORDER.indexOf(a.losBucket) - LOS_ORDER.indexOf(b.losBucket),
    )
    .map((l) => ({
      losBucket: l.losBucket,
      bookings: l.bookings,
      roomNights: l.roomNights,
    }));

  const accounts: AccountRow[] = period.accountProduction.map((a) => ({
    accountName: a.accountName,
    accountType: a.accountType,
    roomNights: a.roomNights,
    revenue: a.revenue.toNumber(),
  }));

  return {
    ...base,
    period: period.period,
    segments,
    roomTypes,
    nationalities,
    lengthOfStay,
    accounts,
  };
}
