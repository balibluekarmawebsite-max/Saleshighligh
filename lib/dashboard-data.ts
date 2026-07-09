import { unstable_noStore as noStore } from "next/cache";

import { achievementPct, avgCheck, cpc, ctr, momChange } from "@/lib/calculations";
import { prisma } from "@/lib/prisma";
import { periodMonthShort } from "@/lib/labels";

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

// ─── Rooms — Guests (nationality, geography, LOS) page ───────────────────────

export interface NationalityRank {
  rank: number;
  countryName: string;
  countryCode: string | null;
  roomNights: number;
  sharePct: number;
  lastYearRoomNights: number | null;
  rankMovement: number | null; // + = moved up vs last year
}

export interface LosBucketRow {
  bucket: string;
  bookings: number;
  roomNights: number;
  lastYearRoomNights: number | null;
  sharePct: number;
}

export interface GuestsPageData {
  property: { code: string; name: string; area: string; roomCount: number };
  period: string;
  scope: "MTD" | "YTD";
  hasData: boolean;
  nationalities: NationalityRank[];
  losBuckets: LosBucketRow[];
  avgLos: number | null;
  share3Plus: number | null;
  dominantBucket: string | null;
}

/** Aggregated data for the Rooms → Guests (nationality / geography / LOS) page. */
export async function getGuestsPageData(
  propertyCode: string,
  period: string,
  scope: "MTD" | "YTD" = "MTD",
): Promise<GuestsPageData | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: { period: periodToDate(period) },
        take: 1,
        include: {
          nationality: { where: { scope }, orderBy: { roomNights: "desc" } },
          lengthOfStay: true,
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
      nationalities: [],
      losBuckets: [],
      avgLos: null,
      share3Plus: null,
      dominantBucket: null,
    };
  }

  const totalRN = rp.nationality.reduce((s, n) => s + n.roomNights, 0);

  // Last-year ranking (only among rows that carry a last-year value).
  const lyRank = new Map<string, number>();
  rp.nationality
    .filter((n) => n.roomNightsLastYear !== null)
    .sort((a, b) => (b.roomNightsLastYear ?? 0) - (a.roomNightsLastYear ?? 0))
    .forEach((n, i) => lyRank.set(n.countryName, i + 1));

  const nationalities: NationalityRank[] = rp.nationality.map((n, i) => {
    const rank = i + 1;
    const prev = lyRank.get(n.countryName);
    return {
      rank,
      countryName: n.countryName,
      countryCode: n.countryCode,
      roomNights: n.roomNights,
      sharePct: totalRN > 0 ? (n.roomNights / totalRN) * 100 : 0,
      lastYearRoomNights: n.roomNightsLastYear ?? null,
      rankMovement: prev !== undefined ? prev - rank : null,
    };
  });

  const LOS_ORDER_LOCAL = ["1", "2", "3", "4", "5", "6", "7+"];
  const losSorted = [...rp.lengthOfStay].sort(
    (a, b) => LOS_ORDER_LOCAL.indexOf(a.losBucket) - LOS_ORDER_LOCAL.indexOf(b.losBucket),
  );
  const totalLosRN = losSorted.reduce((s, l) => s + l.roomNights, 0);
  const totalBookings = losSorted.reduce((s, l) => s + l.bookings, 0);
  const losBuckets: LosBucketRow[] = losSorted.map((l) => ({
    bucket: l.losBucket,
    bookings: l.bookings,
    roomNights: l.roomNights,
    lastYearRoomNights: l.lastYearRoomNights ?? null,
    sharePct: totalLosRN > 0 ? (l.roomNights / totalLosRN) * 100 : 0,
  }));
  const threePlus = losSorted
    .filter((l) => ["3", "4", "5", "6", "7+"].includes(l.losBucket))
    .reduce((s, l) => s + l.roomNights, 0);
  const dominant = [...losSorted].sort((a, b) => b.roomNights - a.roomNights)[0];

  return {
    ...base,
    hasData: true,
    nationalities,
    losBuckets,
    avgLos: totalBookings > 0 ? totalLosRN / totalBookings : null,
    share3Plus: totalLosRN > 0 ? (threePlus / totalLosRN) * 100 : null,
    dominantBucket: dominant ? dominant.losBucket : null,
  };
}

// ─── Marketing (Digital Ads & Online Reputation) page ───────────────────────

export interface AdsPlatformRow {
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number | null;
  trackedRevenue: number;
  ctr: number | null;
  cpc: number | null;
}

export interface AdsSummary {
  totalSpend: number;
  trackedRevenue: number;
  roasPct: number | null;
  roasRatio: number | null;
  totalClicks: number;
  platforms: AdsPlatformRow[];
}

export interface RoasPoint {
  month: string;
  roasPct: number | null;
}

export interface RankCard {
  platform: string;
  rank: number | null;
  totalInMarket: number | null;
  change: number | null; // prevRank - rank (+ = improved, lower is better)
}

export interface RankTrendPoint {
  month: string;
  BOOKING: number | null;
  EXPEDIA: number | null;
  TRIPADVISOR: number | null;
}

export interface TripMetric {
  key: string;
  label: string;
  value: number;
  mom: number | null;
}

export interface MarketingPageData {
  property: { code: string; name: string; area: string; roomCount: number };
  period: string;
  hasData: boolean;
  ads: AdsSummary | null;
  roasTrend: RoasPoint[];
  spendRevenue: { platform: string; spend: number; revenue: number }[];
  rankCards: RankCard[];
  rankTrend: RankTrendPoint[];
  tripadvisor: {
    rank: number | null;
    totalInMarket: number | null;
    rating: number | null;
    area: string;
    metrics: TripMetric[];
  } | null;
}

const ADS_PLATFORM_ORDER = ["GOOGLE", "META", "CORPORATE"];
const RANK_PLATFORMS = ["BOOKING", "EXPEDIA", "TRIPADVISOR"] as const;

type RawAd = {
  platform: string;
  spend: { toNumber(): number };
  impressions: number;
  clicks: number;
  reach: number | null;
  trackedRevenue: { toNumber(): number };
};

/** Build the ads summary + spend/revenue + ROAS trend for one business unit. */
function buildAdsBlock(
  currentAds: RawAd[],
  ascPeriods: { period: Date; adsPerformance: RawAd[] }[],
): {
  ads: AdsSummary | null;
  spendRevenue: { platform: string; spend: number; revenue: number }[];
  roasTrend: RoasPoint[];
} {
  const sorted = [...currentAds].sort(
    (a, b) => ADS_PLATFORM_ORDER.indexOf(a.platform) - ADS_PLATFORM_ORDER.indexOf(b.platform),
  );
  let ads: AdsSummary | null = null;
  let spendRevenue: { platform: string; spend: number; revenue: number }[] = [];
  if (sorted.length > 0) {
    const totalSpend = sorted.reduce((s, a) => s + a.spend.toNumber(), 0);
    const trackedRevenue = sorted.reduce((s, a) => s + a.trackedRevenue.toNumber(), 0);
    const totalClicks = sorted.reduce((s, a) => s + a.clicks, 0);
    const roasRatio = totalSpend > 0 ? trackedRevenue / totalSpend : null;
    ads = {
      totalSpend,
      trackedRevenue,
      roasRatio,
      roasPct: roasRatio !== null ? roasRatio * 100 : null,
      totalClicks,
      platforms: sorted.map((a) => ({
        platform: a.platform,
        spend: a.spend.toNumber(),
        impressions: a.impressions,
        clicks: a.clicks,
        reach: a.reach,
        trackedRevenue: a.trackedRevenue.toNumber(),
        ctr: ctr(a.clicks, a.impressions),
        cpc: cpc(a.spend.toNumber(), a.clicks),
      })),
    };
    spendRevenue = sorted.map((a) => ({
      platform: a.platform,
      spend: a.spend.toNumber(),
      revenue: a.trackedRevenue.toNumber(),
    }));
  }
  const roasTrend: RoasPoint[] = ascPeriods.slice(-6).map((p) => {
    const spend = p.adsPerformance.reduce((s, a) => s + a.spend.toNumber(), 0);
    const rev = p.adsPerformance.reduce((s, a) => s + a.trackedRevenue.toNumber(), 0);
    return {
      month: periodMonthShort(dateToPeriod(p.period)),
      roasPct: spend > 0 ? (rev / spend) * 100 : null,
    };
  });
  return { ads, spendRevenue, roasTrend };
}

/** Aggregated data for the Marketing (ads + reputation) page. */
export async function getMarketingPageData(
  propertyCode: string,
  period: string,
): Promise<MarketingPageData | null> {
  noStore();
  const selectedDate = periodToDate(period);
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: { period: { lte: selectedDate } },
        orderBy: { period: "desc" },
        take: 12,
        include: {
          adsPerformance: { where: { unit: "HOTEL" } },
          platformRankings: true,
          tripadvisorMetrics: { where: { unit: "HOTEL" } },
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

  const current = property.periods.find(
    (p) => p.period.getTime() === selectedDate.getTime(),
  );
  if (!current) {
    return {
      ...base,
      hasData: false,
      ads: null,
      roasTrend: [],
      spendRevenue: [],
      rankCards: [],
      rankTrend: [],
      tripadvisor: null,
    };
  }
  const previous = property.periods.find((p) => p.period.getTime() < selectedDate.getTime());

  // Ads (oldest → newest for trends)
  const asc = [...property.periods].reverse();
  const { ads, spendRevenue, roasTrend } = buildAdsBlock(current.adsPerformance, asc);

  const rankTrend: RankTrendPoint[] = asc.slice(-12).map((p) => {
    const find = (pl: string) => p.platformRankings.find((r) => r.platform === pl)?.rank ?? null;
    return {
      month: periodMonthShort(dateToPeriod(p.period)),
      BOOKING: find("BOOKING"),
      EXPEDIA: find("EXPEDIA"),
      TRIPADVISOR: find("TRIPADVISOR"),
    };
  });

  // Rank cards
  const rankCards: RankCard[] = RANK_PLATFORMS.map((pl) => {
    const cur = current.platformRankings.find((r) => r.platform === pl);
    const prev = previous?.platformRankings.find((r) => r.platform === pl);
    return {
      platform: pl,
      rank: cur?.rank ?? null,
      totalInMarket: cur?.totalInMarket ?? null,
      change: cur && prev ? prev.rank - cur.rank : null,
    };
  });

  // Tripadvisor
  const tm = current.tripadvisorMetrics[0];
  const prevTm = previous?.tripadvisorMetrics[0];
  let tripadvisor: MarketingPageData["tripadvisor"] = null;
  if (tm) {
    const taRank = current.platformRankings.find((r) => r.platform === "TRIPADVISOR");
    const mom = (cur: number, prev: number | undefined) =>
      prev === undefined ? null : momChange(cur, prev);
    tripadvisor = {
      rank: taRank?.rank ?? null,
      totalInMarket: taRank?.totalInMarket ?? null,
      rating: tm.avgRating.toNumber(),
      area: property.area,
      metrics: [
        { key: "impressions", label: "Listing Impressions", value: tm.impressions, mom: mom(tm.impressions, prevTm?.impressions) },
        { key: "pageVisitors", label: "Page Visitors", value: tm.pageVisitors, mom: mom(tm.pageVisitors, prevTm?.pageVisitors) },
        { key: "newReviews", label: "New Reviews", value: tm.newReviews, mom: mom(tm.newReviews, prevTm?.newReviews) },
        { key: "websiteClicks", label: "Website Clicks", value: tm.websiteClicks, mom: mom(tm.websiteClicks, prevTm?.websiteClicks) },
        { key: "mapViews", label: "Map Views", value: tm.mapViews, mom: mom(tm.mapViews, prevTm?.mapViews) },
        { key: "phoneCalls", label: "Phone Calls", value: tm.phoneCalls, mom: mom(tm.phoneCalls, prevTm?.phoneCalls) },
      ],
    };
  }

  return { ...base, hasData: true, ads, roasTrend, spendRevenue, rankCards, rankTrend, tripadvisor };
}

// ─── Restaurant page (aggregated) ────────────────────────────────────────────

export interface MealRow {
  meal: string; // BREAKFAST | LUNCH | DINNER
  coversActual: number;
  coversBudget: number;
  revenueActual: number;
  revenueBudget: number;
  avgCheckActual: number | null;
  avgCheckBudget: number | null;
  pctOfRevenue: number; // share of restaurant actual revenue
}

export type FnbSourceCategory = "IN_HOUSE" | "OUTSIDER" | "PLATFORM";

export interface SourceRow {
  sourceName: string;
  category: FnbSourceCategory;
  persons: number;
  revenue: number;
  avgCheck: number | null;
  pctPersons: number;
}

export interface AcqRow {
  channel: string; // WALK_IN | REPEATER | CHOPE | CATERING
  bookingsPct: number; // display percent (0–100)
  coversPct: number;
}

export interface ChopeSummary {
  fulfilledBookings: number;
  fulfilledCovers: number;
  cancelledBookings: number;
  cancelledCovers: number;
  noShows: number;
  revenue: number;
  platformBookings: number;
  directBookings: number;
  pctOfRestaurantRevenue: number | null;
}

export interface GokaiMetric {
  key: string;
  label: string;
  value: number;
  format: "number" | "pct" | "idr";
  mom: number | null;
}

export interface GokaiSummary {
  unit: string; // RESTAURANT or HOTEL (fallback)
  metrics: GokaiMetric[];
}

export interface TripadvisorSummary {
  rank: number | null;
  totalInMarket: number | null;
  rating: number | null;
  area: string;
  noun: string; // "restaurants"
  metrics: TripMetric[];
}

export interface RestaurantPageData {
  property: { code: string; name: string; area: string; restaurantName: string };
  period: string;
  hasData: boolean;
  status: string | null;
  overview: {
    covers: MetricAB;
    revenue: MetricAB;
    avgCheckActual: number | null;
    avgCheckBudget: number | null;
    revenueAchievementPct: number | null;
  } | null;
  meals: MealRow[];
  restaurantRevenueActual: number;
  restaurantRevenueBudget: number;
  sources: SourceRow[];
  acquisition: AcqRow[];
  chope: ChopeSummary | null;
  gokai: GokaiSummary | null;
  ads: AdsSummary | null;
  spendRevenue: { platform: string; spend: number; revenue: number }[];
  roasTrend: RoasPoint[];
  tripadvisor: TripadvisorSummary | null;
  narrative: NarrativeBlock | null;
}

const MEAL_ORDER = ["BREAKFAST", "LUNCH", "DINNER"];
const ACQ_ORDER = ["WALK_IN", "REPEATER", "CHOPE", "CATERING"];

/** Bucket a free-text F&B source name into In-House / Outsider / Platform. */
function classifyFnbSource(name: string): FnbSourceCategory {
  const n = name.toLowerCase();
  if (/chope|grab|gojek|go-?food|traveloka|delivery|online/.test(n)) return "PLATFORM";
  if (/in.?house|house|hotel|villa|resident|guest|stay/.test(n)) return "IN_HOUSE";
  return "OUTSIDER";
}

/** Aggregated data for the Restaurant page (ads + tripadvisor scoped to RESTAURANT). */
export async function getRestaurantPageData(
  propertyCode: string,
  period: string,
): Promise<RestaurantPageData | null> {
  noStore();
  const selectedDate = periodToDate(period);
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: { period: { lte: selectedDate } },
        orderBy: { period: "desc" },
        take: 6,
        include: {
          fnbSales: true,
          fnbSources: true,
          fnbAcquisition: true,
          chopeReports: true,
          gokaiReports: true,
          adsPerformance: { where: { unit: "RESTAURANT" } },
          tripadvisorMetrics: { where: { unit: "RESTAURANT" } },
          narrativeContent: { where: { section: "RESTAURANT_OVERVIEW" } },
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
      restaurantName: property.restaurantName,
    },
    period,
  };

  const current = property.periods.find(
    (p) => p.period.getTime() === selectedDate.getTime(),
  );
  if (!current) {
    return {
      ...base,
      hasData: false,
      status: null,
      overview: null,
      meals: [],
      restaurantRevenueActual: 0,
      restaurantRevenueBudget: 0,
      sources: [],
      acquisition: [],
      chope: null,
      gokai: null,
      ads: null,
      spendRevenue: [],
      roasTrend: [],
      tripadvisor: null,
      narrative: null,
    };
  }
  const previous = property.periods.find((p) => p.period.getTime() < selectedDate.getTime());

  // Meal-period performance
  const mealSorted = [...current.fnbSales].sort(
    (a, b) => MEAL_ORDER.indexOf(a.mealPeriod) - MEAL_ORDER.indexOf(b.mealPeriod),
  );
  const restaurantRevenueActual = mealSorted.reduce((s, m) => s + m.revenueActual.toNumber(), 0);
  const restaurantRevenueBudget = mealSorted.reduce((s, m) => s + m.revenueBudget.toNumber(), 0);
  const meals: MealRow[] = mealSorted.map((m) => {
    const revenueActual = m.revenueActual.toNumber();
    const revenueBudget = m.revenueBudget.toNumber();
    return {
      meal: m.mealPeriod,
      coversActual: m.coversActual,
      coversBudget: m.coversBudget,
      revenueActual,
      revenueBudget,
      avgCheckActual: avgCheck(revenueActual, m.coversActual),
      avgCheckBudget: avgCheck(revenueBudget, m.coversBudget),
      pctOfRevenue: restaurantRevenueActual > 0 ? (revenueActual / restaurantRevenueActual) * 100 : 0,
    };
  });

  const coversActual = mealSorted.reduce((s, m) => s + m.coversActual, 0);
  const coversBudget = mealSorted.reduce((s, m) => s + m.coversBudget, 0);
  const overview =
    mealSorted.length > 0
      ? {
          covers: { actual: coversActual, budget: coversBudget },
          revenue: { actual: restaurantRevenueActual, budget: restaurantRevenueBudget },
          avgCheckActual: avgCheck(restaurantRevenueActual, coversActual),
          avgCheckBudget: avgCheck(restaurantRevenueBudget, coversBudget),
          revenueAchievementPct: achievementPct(restaurantRevenueActual, restaurantRevenueBudget),
        }
      : null;

  // Source of booking
  const totalPersons = current.fnbSources.reduce((s, r) => s + r.persons, 0);
  const sources: SourceRow[] = [...current.fnbSources]
    .map((r) => {
      const revenue = r.revenue.toNumber();
      return {
        sourceName: r.sourceName,
        category: classifyFnbSource(r.sourceName),
        persons: r.persons,
        revenue,
        avgCheck: avgCheck(revenue, r.persons),
        pctPersons: totalPersons > 0 ? (r.persons / totalPersons) * 100 : 0,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // Acquisition mix (stored as ratios → display percents)
  const acquisition: AcqRow[] = [...current.fnbAcquisition]
    .sort((a, b) => ACQ_ORDER.indexOf(a.channel) - ACQ_ORDER.indexOf(b.channel))
    .map((r) => ({
      channel: r.channel,
      bookingsPct: r.bookingsPct.toNumber() * 100,
      coversPct: r.coversPct.toNumber() * 100,
    }));

  // Chope
  const chopeRow = current.chopeReports[0];
  const chope: ChopeSummary | null = chopeRow
    ? {
        fulfilledBookings: chopeRow.fulfilledBookings,
        fulfilledCovers: chopeRow.fulfilledCovers,
        cancelledBookings: chopeRow.cancelledBookings,
        cancelledCovers: chopeRow.cancelledCovers,
        noShows: chopeRow.noShows,
        revenue: chopeRow.revenue.toNumber(),
        platformBookings: chopeRow.platformBookings,
        directBookings: chopeRow.directBookings,
        pctOfRestaurantRevenue:
          restaurantRevenueActual > 0
            ? (chopeRow.revenue.toNumber() / restaurantRevenueActual) * 100
            : null,
      }
    : null;

  // Gokai (prefer RESTAURANT unit, fall back to HOTEL)
  const pickGokai = (p: typeof current | undefined) =>
    p?.gokaiReports.find((g) => g.unit === "RESTAURANT") ??
    p?.gokaiReports.find((g) => g.unit === "HOTEL");
  const gCur = pickGokai(current);
  let gokai: GokaiSummary | null = null;
  if (gCur) {
    const gPrev = previous?.gokaiReports.find((g) => g.unit === gCur.unit);
    const mom = (cur: number, prev: number | undefined) =>
      prev === undefined ? null : momChange(cur, prev);
    gokai = {
      unit: gCur.unit,
      metrics: [
        { key: "signups", label: "Sign-ups", value: gCur.signups, format: "number", mom: mom(gCur.signups, gPrev?.signups) },
        { key: "openRate", label: "Open Rate", value: gCur.openRatePct.toNumber() * 100, format: "pct", mom: mom(gCur.openRatePct.toNumber(), gPrev?.openRatePct.toNumber()) },
        { key: "ctr", label: "CTR", value: gCur.ctrPct.toNumber() * 100, format: "pct", mom: mom(gCur.ctrPct.toNumber(), gPrev?.ctrPct.toNumber()) },
        { key: "survey", label: "Survey Completion", value: gCur.surveyCompletionPct.toNumber() * 100, format: "pct", mom: mom(gCur.surveyCompletionPct.toNumber(), gPrev?.surveyCompletionPct.toNumber()) },
        { key: "upsellSales", label: "Upsell Sales", value: gCur.upsellSales, format: "number", mom: mom(gCur.upsellSales, gPrev?.upsellSales) },
        { key: "upsellRevenue", label: "Upsell Revenue", value: gCur.upsellRevenue.toNumber(), format: "idr", mom: mom(gCur.upsellRevenue.toNumber(), gPrev?.upsellRevenue.toNumber()) },
      ],
    };
  }

  // Ads (unit=RESTAURANT), oldest → newest for the ROAS trend
  const asc = [...property.periods].reverse();
  const { ads, spendRevenue, roasTrend } = buildAdsBlock(current.adsPerformance, asc);

  // Tripadvisor (unit=RESTAURANT). Per-outlet ranking is not modelled, so
  // rank/total stay null until sourced; rating + engagement come from the row.
  const tm = current.tripadvisorMetrics[0];
  const prevTm = previous?.tripadvisorMetrics[0];
  let tripadvisor: TripadvisorSummary | null = null;
  if (tm) {
    const mom = (cur: number, prev: number | undefined) =>
      prev === undefined ? null : momChange(cur, prev);
    const menuMom =
      tm.menuViews != null && prevTm?.menuViews != null ? momChange(tm.menuViews, prevTm.menuViews) : null;
    tripadvisor = {
      rank: null,
      totalInMarket: null,
      rating: tm.avgRating.toNumber(),
      area: property.area,
      noun: "restaurants",
      metrics: [
        { key: "impressions", label: "Impressions", value: tm.impressions, mom: mom(tm.impressions, prevTm?.impressions) },
        { key: "pageVisitors", label: "Page Visitors", value: tm.pageVisitors, mom: mom(tm.pageVisitors, prevTm?.pageVisitors) },
        { key: "newReviews", label: "New Reviews", value: tm.newReviews, mom: mom(tm.newReviews, prevTm?.newReviews) },
        { key: "menuViews", label: "Menu Views", value: tm.menuViews ?? 0, mom: menuMom },
        { key: "websiteClicks", label: "Website Clicks", value: tm.websiteClicks, mom: mom(tm.websiteClicks, prevTm?.websiteClicks) },
        { key: "phoneCalls", label: "Phone Calls", value: tm.phoneCalls, mom: mom(tm.phoneCalls, prevTm?.phoneCalls) },
      ],
    };
  }

  const narr = current.narrativeContent[0];
  const narrative = narr ? { content: narr.content, aiGenerated: narr.aiGenerated } : null;

  return {
    ...base,
    hasData: true,
    status: current.status,
    overview,
    meals,
    restaurantRevenueActual,
    restaurantRevenueBudget,
    sources,
    acquisition,
    chope,
    gokai,
    ads,
    spendRevenue,
    roasTrend,
    tripadvisor,
    narrative,
  };
}

// ─── Spa & Wellness page (aggregated) ────────────────────────────────────────

export interface SpaSegmentRow {
  segment: string; // IN_HOUSE | OUTSIDE | INCLUSION
  coversActual: number;
  coversBudget: number;
  revenueActual: number;
  revenueBudget: number;
  avgCheckActual: number | null;
  avgCheckBudget: number | null;
}

export interface SpaTreatmentRow {
  rank: number;
  treatmentName: string;
  count: number;
  revenue: number;
  avgPrice: number | null;
}

export interface SpaPageData {
  property: { code: string; name: string; area: string; spaName: string };
  period: string;
  hasData: boolean;
  status: string | null;
  overview: {
    covers: MetricAB;
    revenue: MetricAB;
    avgCheckActual: number | null;
    avgCheckBudget: number | null;
    revenueAchievementPct: number | null;
  } | null;
  segments: SpaSegmentRow[];
  treatments: SpaTreatmentRow[];
  ads: AdsSummary | null;
  spendRevenue: { platform: string; spend: number; revenue: number }[];
  roasTrend: RoasPoint[];
  gokai: GokaiSummary | null;
  narrative: NarrativeBlock | null;
}

const SPA_SEGMENT_ORDER = ["IN_HOUSE", "OUTSIDE", "INCLUSION"];

/** Aggregated data for the Spa & Wellness page (ads scoped to SPA). */
export async function getSpaPageData(
  propertyCode: string,
  period: string,
): Promise<SpaPageData | null> {
  noStore();
  const selectedDate = periodToDate(period);
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: { period: { lte: selectedDate } },
        orderBy: { period: "desc" },
        take: 6,
        include: {
          spaSales: true,
          spaTreatments: { orderBy: { revenue: "desc" } },
          gokaiReports: true,
          adsPerformance: { where: { unit: "SPA" } },
          narrativeContent: { where: { section: "SPA_OVERVIEW" } },
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
      spaName: property.spaName,
    },
    period,
  };

  const current = property.periods.find(
    (p) => p.period.getTime() === selectedDate.getTime(),
  );
  if (!current) {
    return {
      ...base,
      hasData: false,
      status: null,
      overview: null,
      segments: [],
      treatments: [],
      ads: null,
      spendRevenue: [],
      roasTrend: [],
      gokai: null,
      narrative: null,
    };
  }
  const previous = property.periods.find((p) => p.period.getTime() < selectedDate.getTime());

  // Guest-segment performance
  const segSorted = [...current.spaSales].sort(
    (a, b) => SPA_SEGMENT_ORDER.indexOf(a.guestSegment) - SPA_SEGMENT_ORDER.indexOf(b.guestSegment),
  );
  const segments: SpaSegmentRow[] = segSorted.map((s) => {
    const revenueActual = s.revenueActual.toNumber();
    const revenueBudget = s.revenueBudget.toNumber();
    return {
      segment: s.guestSegment,
      coversActual: s.coversActual,
      coversBudget: s.coversBudget,
      revenueActual,
      revenueBudget,
      avgCheckActual: avgCheck(revenueActual, s.coversActual),
      avgCheckBudget: avgCheck(revenueBudget, s.coversBudget),
    };
  });

  const coversActual = segments.reduce((s, r) => s + r.coversActual, 0);
  const coversBudget = segments.reduce((s, r) => s + r.coversBudget, 0);
  const revenueActual = segments.reduce((s, r) => s + r.revenueActual, 0);
  const revenueBudget = segments.reduce((s, r) => s + r.revenueBudget, 0);
  const overview =
    segments.length > 0
      ? {
          covers: { actual: coversActual, budget: coversBudget },
          revenue: { actual: revenueActual, budget: revenueBudget },
          avgCheckActual: avgCheck(revenueActual, coversActual),
          avgCheckBudget: avgCheck(revenueBudget, coversBudget),
          revenueAchievementPct: achievementPct(revenueActual, revenueBudget),
        }
      : null;

  // Top treatments
  const treatments: SpaTreatmentRow[] = current.spaTreatments.slice(0, 10).map((t, i) => {
    const revenue = t.revenue.toNumber();
    return {
      rank: i + 1,
      treatmentName: t.treatmentName,
      count: t.treatmentCount,
      revenue,
      avgPrice: avgCheck(revenue, t.treatmentCount),
    };
  });

  // Ads (unit=SPA)
  const asc = [...property.periods].reverse();
  const { ads, spendRevenue, roasTrend } = buildAdsBlock(current.adsPerformance, asc);

  // Gokai (prefer SPA unit, fall back to HOTEL) — product/upsell focus
  const pickGokai = (p: typeof current | undefined) =>
    p?.gokaiReports.find((g) => g.unit === "SPA") ??
    p?.gokaiReports.find((g) => g.unit === "HOTEL");
  const gCur = pickGokai(current);
  let gokai: GokaiSummary | null = null;
  if (gCur) {
    const gPrev = previous?.gokaiReports.find((g) => g.unit === gCur.unit);
    const mom = (cur: number, prev: number | undefined) =>
      prev === undefined ? null : momChange(cur, prev);
    gokai = {
      unit: gCur.unit,
      metrics: [
        { key: "productViews", label: "Product Views", value: gCur.productViews, format: "number", mom: mom(gCur.productViews, gPrev?.productViews) },
        { key: "upsellSales", label: "Upsell Sales", value: gCur.upsellSales, format: "number", mom: mom(gCur.upsellSales, gPrev?.upsellSales) },
        { key: "upsellRevenue", label: "Upsell Revenue", value: gCur.upsellRevenue.toNumber(), format: "idr", mom: mom(gCur.upsellRevenue.toNumber(), gPrev?.upsellRevenue.toNumber()) },
        { key: "refunds", label: "Refunds", value: gCur.refunds, format: "number", mom: mom(gCur.refunds, gPrev?.refunds) },
      ],
    };
  }

  const narr = current.narrativeContent[0];
  const narrative = narr ? { content: narr.content, aiGenerated: narr.aiGenerated } : null;

  return {
    ...base,
    hasData: true,
    status: current.status,
    overview,
    segments,
    treatments,
    ads,
    spendRevenue,
    roasTrend,
    gokai,
    narrative,
  };
}

// ─── Market Intelligence & Forecast page (aggregated) ────────────────────────

export interface PaceRow {
  targetMonth: string; // yyyy-mm
  monthLabel: string; // "Jul"
  otbOcc: number; // percent (latest snapshot)
  prevOcc: number | null; // percent (previous snapshot)
  pickup: number | null; // points (otb − prev)
  marketDemand: number | null; // percent
  note: string;
  snapshotDate: string; // ISO date
}

export interface RevenueForecastRow {
  month: string;
  monthLabel: string;
  forecastRevenue: number | null;
  budgetRevenue: number | null;
  gap: number | null;
  cumulativeGap: number | null;
}

export interface MarketSupplyCard {
  areaName: string;
  propertiesCount: number;
  propertiesCountLastYear: number | null;
  yoyPct: number | null;
  trend: number[];
}

export interface MarketAlert {
  kind: "below_demand" | "negative_pickup";
  month: string;
  message: string;
}

export interface MarketPageData {
  property: { code: string; name: string; area: string; roomCount: number };
  period: string;
  hasData: boolean;
  status: string | null;
  pace: PaceRow[];
  paceAsOf: string | null;
  forecasts: ForecastPoint[];
  revenueForecast: RevenueForecastRow[];
  revenueForecastCumulativeGap: number | null;
  supply: MarketSupplyCard[];
  demandRange: { min: number; max: number } | null;
  narrative: NarrativeBlock | null;
  alerts: MarketAlert[];
}

/** Aggregated data for the Market Intelligence & Forecast page. */
export async function getMarketPageData(
  propertyCode: string,
  period: string,
): Promise<MarketPageData | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    include: {
      periods: {
        where: { period: periodToDate(period) },
        take: 1,
        include: {
          bookingPace: true,
          forecasts: { orderBy: { targetMonth: "asc" }, take: 6 },
          marketSupply: { orderBy: { areaName: "asc" } },
          narrativeContent: { where: { section: "MARKET_INTEL" } },
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
      pace: [],
      paceAsOf: null,
      forecasts: [],
      revenueForecast: [],
      revenueForecastCumulativeGap: null,
      supply: [],
      demandRange: null,
      narrative: null,
      alerts: [],
    };
  }

  // Booking pace — keep the latest snapshot per target month, next 6 months.
  const paceByMonth = new Map<string, (typeof rp.bookingPace)[number]>();
  for (const bp of rp.bookingPace) {
    const key = dateToPeriod(bp.targetMonth);
    const existing = paceByMonth.get(key);
    if (!existing || bp.snapshotDate.getTime() > existing.snapshotDate.getTime()) {
      paceByMonth.set(key, bp);
    }
  }
  const pace: PaceRow[] = [...paceByMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(0, 6)
    .map(([key, bp]) => {
      const otbOcc = bp.occupancyOnBooks.toNumber() * 100;
      const prevOcc = bp.previousSnapshotOcc ? bp.previousSnapshotOcc.toNumber() * 100 : null;
      const marketDemand = bp.marketDemandPct ? bp.marketDemandPct.toNumber() * 100 : null;
      return {
        targetMonth: key,
        monthLabel: periodMonthShort(key),
        otbOcc,
        prevOcc,
        pickup: prevOcc !== null ? otbOcc - prevOcc : null,
        marketDemand,
        note: bp.note,
        snapshotDate: bp.snapshotDate.toISOString(),
      };
    });
  const paceAsOf = pace.length
    ? pace.reduce((m, r) => (r.snapshotDate > m ? r.snapshotDate : m), pace[0]!.snapshotDate)
    : null;

  // 6-month occupancy forecast
  const forecasts: ForecastPoint[] = rp.forecasts.map((f) => ({
    month: dateToPeriod(f.targetMonth),
    forecastOcc: f.forecastOccPct ? f.forecastOccPct.toNumber() * 100 : null,
    lastYearOcc: f.lastYearOccPct ? f.lastYearOccPct.toNumber() * 100 : null,
    marketDemand: f.marketDemandPct ? f.marketDemandPct.toNumber() * 100 : null,
  }));

  // Revenue forecast vs budget (with running cumulative gap)
  let cum = 0;
  const revenueForecast: RevenueForecastRow[] = rp.forecasts
    .filter((f) => f.forecastRevenue !== null || f.budgetRevenue !== null)
    .map((f) => {
      const fr = f.forecastRevenue ? f.forecastRevenue.toNumber() : null;
      const br = f.budgetRevenue ? f.budgetRevenue.toNumber() : null;
      const gap = fr !== null && br !== null ? fr - br : null;
      if (gap !== null) cum += gap;
      const monthKey = dateToPeriod(f.targetMonth);
      return {
        month: monthKey,
        monthLabel: periodMonthShort(monthKey),
        forecastRevenue: fr,
        budgetRevenue: br,
        gap,
        cumulativeGap: gap !== null ? cum : null,
      };
    });
  const revenueForecastCumulativeGap = revenueForecast.length ? cum : null;

  // Demand range across forecast + pace
  const demandVals = [
    ...forecasts.map((f) => f.marketDemand),
    ...pace.map((p) => p.marketDemand),
  ].filter((v): v is number => v !== null);
  const demandRange = demandVals.length
    ? { min: Math.min(...demandVals), max: Math.max(...demandVals) }
    : null;

  // Supply context
  const supply: MarketSupplyCard[] = rp.marketSupply.map((m) => {
    const ly = m.propertiesCountLastYear;
    return {
      areaName: m.areaName,
      propertiesCount: m.propertiesCount,
      propertiesCountLastYear: ly ?? null,
      yoyPct: ly !== null && ly > 0 ? momChange(m.propertiesCount, ly) : null,
      trend: ly !== null ? [ly, m.propertiesCount] : [m.propertiesCount],
    };
  });

  // Rule-based alerts
  const alerts: MarketAlert[] = [];
  for (const p of pace) {
    if (p.marketDemand !== null && p.marketDemand - p.otbOcc > 15) {
      alerts.push({
        kind: "below_demand",
        month: p.monthLabel,
        message: `${p.monthLabel}: on-the-books ${p.otbOcc.toFixed(0)}% is ${(p.marketDemand - p.otbOcc).toFixed(0)} pts below market demand (${p.marketDemand.toFixed(0)}%)`,
      });
    }
    if (p.pickup !== null && p.pickup < 0) {
      alerts.push({
        kind: "negative_pickup",
        month: p.monthLabel,
        message: `${p.monthLabel}: pickup ${p.pickup.toFixed(1)} pts since the last snapshot`,
      });
    }
  }

  const narr = rp.narrativeContent[0];
  const narrative = narr ? { content: narr.content, aiGenerated: narr.aiGenerated } : null;

  return {
    ...base,
    hasData: true,
    status: rp.status,
    pace,
    paceAsOf,
    forecasts,
    revenueForecast,
    revenueForecastCumulativeGap,
    supply,
    demandRange,
    narrative,
    alerts,
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
