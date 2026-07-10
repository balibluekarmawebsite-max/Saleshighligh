import { unstable_noStore as noStore } from "next/cache";

import { achievementPct, momChange, roas } from "@/lib/calculations";
import { dateToPeriod, periodToDate } from "@/lib/dashboard-data";
import { periodMonthShort } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

/**
 * Cross-property ("Group") aggregation (Phase 15). Revenues are summed; rates
 * (occupancy, ADR, RevPAR) are weighted blends by room count / sold rooms.
 * Everything is one batch of queries across the three properties.
 */

export interface GroupKpiCell {
  actual: number | null;
  budget: number | null;
  achievement: number | null;
}

export interface GroupKpiRow {
  key: string;
  label: string;
  format: "ratio" | "idr";
  section: string;
  perProperty: Record<string, GroupKpiCell>;
  group: GroupKpiCell;
}

export interface GroupSeries {
  code: string;
  name: string;
  values: (number | null)[];
}

export interface GroupData {
  period: string;
  hasData: boolean;
  properties: { code: string; name: string; roomCount: number }[];
  kpis: GroupKpiRow[];
  revenueTrend: { months: string[]; series: GroupSeries[] };
  deptAchievement: { categories: string[]; series: GroupSeries[] };
  roas: { categories: string[]; series: GroupSeries[] };
  nationalities: { countryName: string; roomNights: number }[];
  forecast: { months: string[]; series: GroupSeries[]; demandLow: (number | null)[]; demandHigh: (number | null)[] };
  leaderboards: {
    bestRoas: { property: string; unit: string; platform: string; roasPct: number } | null;
    bestTripadvisor: { property: string; rank: number; total: number | null } | null;
    bestSocial: { property: string; momPct: number } | null;
    topAccount: { property: string; accountName: string; revenue: number } | null;
  };
}

const KPI_DEFS: { key: string; label: string; format: "ratio" | "idr"; section: string }[] = [
  { key: "OCCUPANCY", label: "Occupancy", format: "ratio", section: "summary" },
  { key: "ADR", label: "ADR", format: "idr", section: "summary" },
  { key: "REVPAR", label: "RevPAR", format: "idr", section: "summary" },
  { key: "ROOM_REVENUE", label: "Room Revenue", format: "idr", section: "summary" },
  { key: "FNB", label: "F&B", format: "idr", section: "restaurant" },
  { key: "SPA_WELLNESS", label: "Spa", format: "idr", section: "spa" },
  { key: "TOTAL_REVENUE", label: "Total Revenue", format: "idr", section: "summary" },
];
const SUM_KEYS = new Set(["ROOM_REVENUE", "FNB", "SPA_WELLNESS", "TOTAL_REVENUE"]);
const UNIT_DEFS: { unit: string; label: string }[] = [
  { unit: "HOTEL", label: "Hotel" },
  { unit: "RESTAURANT", label: "Restaurant" },
  { unit: "SPA", label: "Spa" },
];

type DeptVal = { actual: number; budget: number };

export const GROUP_SUMMARY_SECTION = "GROUP_SUMMARY";

export async function getGroupData(period: string): Promise<GroupData> {
  noStore();
  const periodDate = periodToDate(period);
  const props = await prisma.property.findMany({
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, roomCount: true },
  });
  const ids = props.map((p) => p.id);
  const codeById = new Map(props.map((p) => [p.id, p.code]));
  const base = { period, properties: props.map((p) => ({ code: p.code, name: p.name, roomCount: p.roomCount })) };

  const cur = await prisma.reportPeriod.findMany({
    where: { period: periodDate, propertyId: { in: ids } },
    include: {
      revenueSummaries: true,
      forecasts: { orderBy: { targetMonth: "asc" }, take: 6 },
      nationality: { where: { scope: "MTD" } },
      adsPerformance: true,
      platformRankings: true,
      socialMediaMetrics: true,
      accountProduction: true,
    },
  });
  const curByProp = new Map(cur.map((rp) => [rp.propertyId, rp]));

  if (cur.length === 0) {
    return {
      ...base,
      hasData: false,
      kpis: [],
      revenueTrend: { months: [], series: [] },
      deptAchievement: { categories: [], series: [] },
      roas: { categories: [], series: [] },
      nationalities: [],
      forecast: { months: [], series: [], demandLow: [], demandHigh: [] },
      leaderboards: { bestRoas: null, bestTripadvisor: null, bestSocial: null, topAccount: null },
    };
  }

  const prev = await prisma.reportPeriod.findMany({
    where: { period: { lt: periodDate }, propertyId: { in: ids } },
    orderBy: { period: "desc" },
    include: { socialMediaMetrics: true },
  });
  const prevByProp = new Map<string, (typeof prev)[number]>();
  for (const rp of prev) if (!prevByProp.has(rp.propertyId)) prevByProp.set(rp.propertyId, rp);

  const trendRows = await prisma.revenueSummary.findMany({
    where: { department: "TOTAL_REVENUE", period: { propertyId: { in: ids }, period: { lte: periodDate } } },
    select: { actual: true, period: { select: { period: true, propertyId: true } } },
  });

  // Per-property department map.
  const deptByProp = new Map<string, Map<string, DeptVal>>();
  for (const rp of cur) {
    const m = new Map<string, DeptVal>();
    for (const r of rp.revenueSummaries) m.set(r.department, { actual: r.actual.toNumber(), budget: r.budget.toNumber() });
    deptByProp.set(rp.propertyId, m);
  }
  const roomCountById = new Map(props.map((p) => [p.id, p.roomCount]));
  const getDept = (pid: string, key: string): DeptVal | null => deptByProp.get(pid)?.get(key) ?? null;

  // ── KPI matrix ──────────────────────────────────────────────────────────
  const kpis: GroupKpiRow[] = KPI_DEFS.map((def) => {
    const perProperty: Record<string, GroupKpiCell> = {};
    for (const p of props) {
      const v = getDept(p.id, def.key);
      perProperty[p.code] = v ? { actual: v.actual, budget: v.budget, achievement: achievementPct(v.actual, v.budget) } : { actual: null, budget: null, achievement: null };
    }
    const group = groupCell(def.key, props, getDept, roomCountById);
    return { key: def.key, label: def.label, format: def.format, section: def.section, perProperty, group };
  });

  // ── Revenue trend (last 12 months, stacked by property) ─────────────────
  const monthMap = new Map<string, Map<string, number>>(); // month → propId → total
  for (const row of trendRows) {
    const month = dateToPeriod(row.period.period);
    if (!monthMap.has(month)) monthMap.set(month, new Map());
    monthMap.get(month)!.set(row.period.propertyId, (monthMap.get(month)!.get(row.period.propertyId) ?? 0) + row.actual.toNumber());
  }
  const months = [...monthMap.keys()].sort().slice(-12);
  const revenueTrend = {
    months: months.map(periodMonthShort),
    series: props.map((p) => ({ code: p.code, name: p.code, values: months.map((m) => monthMap.get(m)?.get(p.id) ?? null) })),
  };

  // ── Achievement % by department, grouped by property ────────────────────
  const deptCats = [
    { key: "ROOM_REVENUE", label: "Rooms" },
    { key: "FNB", label: "F&B" },
    { key: "SPA_WELLNESS", label: "Spa" },
    { key: "TOTAL_REVENUE", label: "Total" },
  ];
  const deptAchievement = {
    categories: deptCats.map((c) => c.label),
    series: props.map((p) => ({
      code: p.code,
      name: p.code,
      values: deptCats.map((c) => {
        const v = getDept(p.id, c.key);
        return v ? achievementPct(v.actual, v.budget) : null;
      }),
    })),
  };

  // ── ROAS across properties × units ──────────────────────────────────────
  const roasData = {
    categories: UNIT_DEFS.map((u) => u.label),
    series: props.map((p) => {
      const rp = curByProp.get(p.id);
      return {
        code: p.code,
        name: p.code,
        values: UNIT_DEFS.map((u) => {
          const rows = rp?.adsPerformance.filter((a) => a.unit === u.unit) ?? [];
          if (rows.length === 0) return null;
          const spend = rows.reduce((s, a) => s + a.spend.toNumber(), 0);
          const rev = rows.reduce((s, a) => s + a.trackedRevenue.toNumber(), 0);
          const r = roas(rev, spend);
          return r == null ? null : r * 100;
        }),
      };
    }),
  };

  // ── Merged nationality top 10 ───────────────────────────────────────────
  const natMap = new Map<string, number>();
  for (const rp of cur) for (const n of rp.nationality) natMap.set(n.countryName, (natMap.get(n.countryName) ?? 0) + n.roomNights);
  const nationalities = [...natMap.entries()].map(([countryName, roomNights]) => ({ countryName, roomNights })).sort((a, b) => b.roomNights - a.roomNights).slice(0, 10);

  // ── Forecast: 3 property lines + market-demand band ─────────────────────
  const fMonthsSet = new Set<string>();
  for (const rp of cur) for (const f of rp.forecasts) fMonthsSet.add(dateToPeriod(f.targetMonth));
  const fMonths = [...fMonthsSet].sort().slice(0, 6);
  const demandByMonth = new Map<string, number[]>();
  for (const rp of cur) {
    for (const f of rp.forecasts) {
      if (f.marketDemandPct != null) {
        const mk = dateToPeriod(f.targetMonth);
        if (!demandByMonth.has(mk)) demandByMonth.set(mk, []);
        demandByMonth.get(mk)!.push(f.marketDemandPct.toNumber() * 100);
      }
    }
  }
  const forecast = {
    months: fMonths.map(periodMonthShort),
    series: props.map((p) => {
      const rp = curByProp.get(p.id);
      const byMonth = new Map(rp?.forecasts.map((f) => [dateToPeriod(f.targetMonth), f.forecastOccPct ? f.forecastOccPct.toNumber() * 100 : null]) ?? []);
      return { code: p.code, name: p.code, values: fMonths.map((m) => byMonth.get(m) ?? null) };
    }),
    demandLow: fMonths.map((m) => { const d = demandByMonth.get(m); return d && d.length ? Math.min(...d) : null; }),
    demandHigh: fMonths.map((m) => { const d = demandByMonth.get(m); return d && d.length ? Math.max(...d) : null; }),
  };

  // ── Leaderboards ────────────────────────────────────────────────────────
  let bestRoas: GroupData["leaderboards"]["bestRoas"] = null;
  let bestTripadvisor: GroupData["leaderboards"]["bestTripadvisor"] = null;
  let bestSocial: GroupData["leaderboards"]["bestSocial"] = null;
  let topAccount: GroupData["leaderboards"]["topAccount"] = null;

  for (const rp of cur) {
    const code = codeById.get(rp.propertyId)!;
    for (const a of rp.adsPerformance) {
      const spend = a.spend.toNumber();
      if (spend <= 0) continue;
      const r = roas(a.trackedRevenue.toNumber(), spend);
      if (r != null && (bestRoas == null || r * 100 > bestRoas.roasPct)) bestRoas = { property: code, unit: a.unit, platform: a.platform, roasPct: r * 100 };
    }
    for (const pr of rp.platformRankings) {
      if (pr.platform !== "TRIPADVISOR") continue;
      if (bestTripadvisor == null || pr.rank < bestTripadvisor.rank) bestTripadvisor = { property: code, rank: pr.rank, total: pr.totalInMarket ?? null };
    }
    for (const acc of rp.accountProduction) {
      const rev = acc.revenue.toNumber();
      if (topAccount == null || rev > topAccount.revenue) topAccount = { property: code, accountName: acc.accountName, revenue: rev };
    }
    // social reach MoM
    const prevRp = prevByProp.get(rp.propertyId);
    if (prevRp) {
      const curReach = rp.socialMediaMetrics.reduce((s, m) => s + m.reach, 0);
      const prevReach = prevRp.socialMediaMetrics.reduce((s, m) => s + m.reach, 0);
      const mom = prevReach > 0 ? momChange(curReach, prevReach) : null;
      if (mom != null && (bestSocial == null || mom > bestSocial.momPct)) bestSocial = { property: code, momPct: mom };
    }
  }

  return {
    ...base,
    hasData: true,
    kpis,
    revenueTrend,
    deptAchievement,
    roas: roasData,
    nationalities,
    forecast,
    leaderboards: { bestRoas, bestTripadvisor, bestSocial, topAccount },
  };
}

/** Group-level cell for a KPI: sum for revenues, room-weighted blend for rates. */
function groupCell(
  key: string,
  props: { id: string; roomCount: number }[],
  getDept: (pid: string, key: string) => DeptVal | null,
  roomCountById: Map<string, number>,
): GroupKpiCell {
  if (SUM_KEYS.has(key)) {
    let a = 0;
    let b = 0;
    let any = false;
    for (const p of props) {
      const v = getDept(p.id, key);
      if (v) {
        a += v.actual;
        b += v.budget;
        any = true;
      }
    }
    return any ? { actual: a, budget: b, achievement: achievementPct(a, b) } : { actual: null, budget: null, achievement: null };
  }

  // Occupancy / RevPAR: weight by room count. ADR: weight by sold rooms (occ·rooms).
  const occByProp = new Map<string, DeptVal | null>();
  for (const p of props) occByProp.set(p.id, getDept(p.id, "OCCUPANCY"));

  let numA = 0;
  let denA = 0;
  let numB = 0;
  let denB = 0;
  let any = false;
  for (const p of props) {
    const v = getDept(p.id, key);
    if (!v) continue;
    const rc = roomCountById.get(p.id) ?? 0;
    const occ = occByProp.get(p.id);
    const wA = key === "ADR" && occ ? occ.actual * rc : rc;
    const wB = key === "ADR" && occ ? occ.budget * rc : rc;
    if (wA > 0) {
      numA += v.actual * wA;
      denA += wA;
    }
    if (wB > 0) {
      numB += v.budget * wB;
      denB += wB;
    }
    any = true;
  }
  if (!any || denA === 0) return { actual: null, budget: null, achievement: null };
  const actual = numA / denA;
  const budget = denB > 0 ? numB / denB : null;
  return { actual, budget, achievement: budget != null ? achievementPct(actual, budget) : null };
}
