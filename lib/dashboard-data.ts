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
    defaultPath = `/dashboard/${withData.code}/${dateToPeriod(withData.periods[0]!.period)}/summary`;
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

// ─── Executive Summary page (aggregated) ─────────────────────────────────────

export interface MetricABL {
  actual: number;
  budget: number;
  lastYear: number | null;
}

export interface RevenueLine {
  department: string;
  label: string;
  actual: number;
  budget: number;
  lastYear: number | null;
  format: "idr" | "ratio";
}

export interface MixSlice {
  key: string;
  label: string;
  value: number;
}

export interface NarrativeBlock {
  content: string;
  aiGenerated: boolean;
}

export interface ForecastPoint {
  month: string; // "yyyy-mm"
  forecastOcc: number | null; // percent
  lastYearOcc: number | null;
  marketDemand: number | null;
}

export interface SummaryPageData {
  property: { code: string; name: string; area: string; roomCount: number };
  period: string;
  hasData: boolean;
  status: string | null;
  dataAsOf: string | null;
  metrics: {
    occupancy: MetricABL | null;
    adr: MetricABL | null;
    revpar: MetricABL | null;
    totalRevenue: MetricABL | null;
    roomRevenue: MetricABL | null;
  };
  revenueLines: RevenueLine[];
  mix: MixSlice[];
  narratives: {
    summary: NarrativeBlock | null;
    external: NarrativeBlock | null;
    internal: NarrativeBlock | null;
  };
  forecasts: ForecastPoint[];
}

const SUMMARY_LINES: { dept: string; label: string; format: "idr" | "ratio" }[] = [
  { dept: "OCCUPANCY", label: "Occupancy", format: "ratio" },
  { dept: "ADR", label: "ADR", format: "idr" },
  { dept: "REVPAR", label: "RevPAR", format: "idr" },
  { dept: "ROOM_REVENUE", label: "Room Revenue", format: "idr" },
  { dept: "FNB", label: "F&B", format: "idr" },
  { dept: "SPA_WELLNESS", label: "Spa & Wellness", format: "idr" },
  { dept: "GALLERY", label: "Gallery", format: "idr" },
  { dept: "OOD", label: "OOD", format: "idr" },
  { dept: "TOTAL_REVENUE", label: "Total Revenue", format: "idr" },
];

const MIX_DEPARTMENTS: [string, string][] = [
  ["ROOM_REVENUE", "Rooms"],
  ["FNB", "F&B"],
  ["SPA_WELLNESS", "Spa & Wellness"],
  ["GALLERY", "Gallery"],
  ["OOD", "Other Operating"],
];

/** Single aggregated fetch backing the Executive Summary page. */
export async function getSummaryPageData(
  propertyCode: string,
  period: string,
): Promise<SummaryPageData | null> {
  noStore();
  const periodDate = periodToDate(period);
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: { period: periodDate },
        take: 1,
        include: {
          revenueSummaries: true,
          narrativeContent: {
            where: {
              section: {
                in: ["SUMMARY", "EXTERNAL_FACTORS", "INTERNAL_FACTORS"],
              },
            },
          },
          forecasts: { orderBy: { targetMonth: "asc" }, take: 6 },
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
    period,
  };

  const rp = property.periods[0];
  if (!rp) {
    return {
      ...base,
      hasData: false,
      status: null,
      dataAsOf: null,
      metrics: { occupancy: null, adr: null, revpar: null, totalRevenue: null, roomRevenue: null },
      revenueLines: [],
      mix: [],
      narratives: { summary: null, external: null, internal: null },
      forecasts: [],
    };
  }

  const lastImport = await prisma.importHistory.findFirst({
    where: { propertyId: property.id, period: periodDate },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  const dataAsOf = (lastImport?.createdAt ?? rp.updatedAt).toISOString();

  const byDept = new Map<string, MetricABL>();
  for (const row of rp.revenueSummaries) {
    byDept.set(row.department, {
      actual: row.actual.toNumber(),
      budget: row.budget.toNumber(),
      lastYear: row.lastYear ? row.lastYear.toNumber() : null,
    });
  }

  const revenueLines: RevenueLine[] = SUMMARY_LINES.filter((l) =>
    byDept.has(l.dept),
  ).map((l) => {
    const m = byDept.get(l.dept)!;
    return { department: l.dept, label: l.label, actual: m.actual, budget: m.budget, lastYear: m.lastYear, format: l.format };
  });

  const mix: MixSlice[] = MIX_DEPARTMENTS.map(([dept, label]) => ({
    key: dept,
    label,
    value: byDept.get(dept)?.actual ?? 0,
  })).filter((s) => s.value > 0);

  const narrative = (section: string): NarrativeBlock | null => {
    const n = rp.narrativeContent.find((x) => x.section === section);
    return n ? { content: n.content, aiGenerated: n.aiGenerated } : null;
  };

  const forecasts: ForecastPoint[] = rp.forecasts.map((f) => ({
    month: dateToPeriod(f.targetMonth),
    forecastOcc: f.forecastOccPct ? f.forecastOccPct.toNumber() * 100 : null,
    lastYearOcc: f.lastYearOccPct ? f.lastYearOccPct.toNumber() * 100 : null,
    marketDemand: f.marketDemandPct ? f.marketDemandPct.toNumber() * 100 : null,
  }));

  return {
    ...base,
    hasData: true,
    status: rp.status,
    dataAsOf,
    metrics: {
      occupancy: byDept.get("OCCUPANCY") ?? null,
      adr: byDept.get("ADR") ?? null,
      revpar: byDept.get("REVPAR") ?? null,
      totalRevenue: byDept.get("TOTAL_REVENUE") ?? null,
      roomRevenue: byDept.get("ROOM_REVENUE") ?? null,
    },
    revenueLines,
    mix,
    narratives: {
      summary: narrative("SUMMARY"),
      external: narrative("EXTERNAL_FACTORS"),
      internal: narrative("INTERNAL_FACTORS"),
    },
    forecasts,
  };
}

// ─── Rooms — Segments & Accounts page (aggregated) ───────────────────────────

export interface SeriesTriple {
  rn: number;
  arr: number;
  revenue: number;
}

export interface SegmentRowFull {
  name: string;
  actual: SeriesTriple;
  budget: SeriesTriple;
  lastYear: SeriesTriple | null;
}

export interface AccountRowFull {
  rank: number;
  accountName: string;
  accountType: string;
  roomNights: number;
  revenue: number;
  pctOfRevenue: number;
}

export interface SegmentsPageData {
  property: { code: string; name: string; area: string; roomCount: number };
  period: string;
  scope: "MTD" | "YTD";
  hasData: boolean;
  status: string | null;
  segments: SegmentRowFull[];
  totals: { actual: SeriesTriple; budget: SeriesTriple; lastYear: SeriesTriple | null };
  accounts: AccountRowFull[];
  accountsTotalRevenue: number;
}

const ZERO_TRIPLE: SeriesTriple = { rn: 0, arr: 0, revenue: 0 };

function blendedArr(revenue: number, rn: number): number {
  return rn > 0 ? revenue / rn : 0;
}

/** Aggregated data for the Rooms → Market Segment & Account Production page. */
export async function getSegmentsPageData(
  propertyCode: string,
  period: string,
  scope: "MTD" | "YTD" = "MTD",
): Promise<SegmentsPageData | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: { period: periodToDate(period) },
        take: 1,
        include: {
          segmentProduction: { where: { scope } },
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
    period,
    scope,
  };

  const rp = property.periods[0];
  if (!rp) {
    return {
      ...base,
      hasData: false,
      status: null,
      segments: [],
      totals: { actual: ZERO_TRIPLE, budget: ZERO_TRIPLE, lastYear: null },
      accounts: [],
      accountsTotalRevenue: 0,
    };
  }

  const segMap = new Map<string, SegmentRowFull>();
  for (const row of rp.segmentProduction) {
    const entry =
      segMap.get(row.segmentName) ??
      ({ name: row.segmentName, actual: { ...ZERO_TRIPLE }, budget: { ...ZERO_TRIPLE }, lastYear: null } satisfies SegmentRowFull);
    const triple: SeriesTriple = {
      rn: row.roomNights,
      arr: row.arr.toNumber(),
      revenue: row.roomRevenue.toNumber(),
    };
    if (row.series === "ACTUAL") entry.actual = triple;
    else if (row.series === "BUDGET") entry.budget = triple;
    else if (row.series === "LAST_YEAR") entry.lastYear = triple;
    segMap.set(row.segmentName, entry);
  }
  const segments = [...segMap.values()].sort(
    (a, b) => b.actual.revenue - a.actual.revenue || b.budget.revenue - a.budget.revenue,
  );

  const sumTriple = (pick: (s: SegmentRowFull) => SeriesTriple | null): SeriesTriple => {
    const rn = segments.reduce((t, s) => t + (pick(s)?.rn ?? 0), 0);
    const revenue = segments.reduce((t, s) => t + (pick(s)?.revenue ?? 0), 0);
    return { rn, revenue, arr: blendedArr(revenue, rn) };
  };
  const hasLastYear = segments.some((s) => s.lastYear !== null);
  const totals = {
    actual: sumTriple((s) => s.actual),
    budget: sumTriple((s) => s.budget),
    lastYear: hasLastYear ? sumTriple((s) => s.lastYear) : null,
  };

  const accountsTotalRevenue = rp.accountProduction.reduce(
    (t, a) => t + a.revenue.toNumber(),
    0,
  );
  const accounts: AccountRowFull[] = rp.accountProduction.map((a, i) => {
    const revenue = a.revenue.toNumber();
    return {
      rank: i + 1,
      accountName: a.accountName,
      accountType: a.accountType,
      roomNights: a.roomNights,
      revenue,
      pctOfRevenue: accountsTotalRevenue > 0 ? (revenue / accountsTotalRevenue) * 100 : 0,
    };
  });

  return {
    ...base,
    hasData: true,
    status: rp.status,
    segments,
    totals,
    accounts,
    accountsTotalRevenue,
  };
}

// ─── Rooms — Room Types page (aggregated) ────────────────────────────────────

export interface RoomTypePageData {
  property: { code: string; name: string; area: string; roomCount: number };
  period: string;
  hasData: boolean;
  status: string | null;
  roomTypes: RoomTypeRow[];
  narrative: NarrativeBlock | null;
}

/** Aggregated data for the Rooms → Room Types page. */
export async function getRoomTypesPageData(
  propertyCode: string,
  period: string,
): Promise<RoomTypePageData | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: { period: periodToDate(period) },
        take: 1,
        include: {
          roomTypeProduction: true,
          narrativeContent: { where: { section: "ROOMTYPE_ANALYSIS" } },
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
    period,
  };

  const rp = property.periods[0];
  if (!rp) {
    return { ...base, hasData: false, status: null, roomTypes: [], narrative: null };
  }

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

  const narr = rp.narrativeContent[0];

  return {
    ...base,
    hasData: true,
    status: rp.status,
    roomTypes,
    narrative: narr ? { content: narr.content, aiGenerated: narr.aiGenerated } : null,
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
