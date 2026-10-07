import { unstable_noStore as noStore } from "next/cache";

import { formatIDR, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { delta, growthPercent, headlineMonth, occPercent } from "@/lib/weekly/calculations";
import { weekLabel } from "@/lib/weekly/week";

/**
 * Trends data for the Weekly Reports module: the headline KPIs (occupancy,
 * ADR, room revenue, room nights) tracked week over week for one property, the
 * week-over-week deltas anchored to the selected week, the selected week's
 * social movement, and a cross-property snapshot. Every figure derives from the
 * pure weekly calculation helpers — nothing new is persisted.
 */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const dec = (v: { toNumber(): number } | null): number | null => (v === null ? null : v.toNumber());
const weekIdOf = (endDate: Date): string => endDate.toISOString().slice(0, 10);

interface HeadlineStat {
  month: number;
  rnSold: number | null;
  occActual: { toNumber(): number } | null;
  arrActual: { toNumber(): number } | null;
  revActual: { toNumber(): number } | null;
  occLy?: unknown;
}

interface HeadlineFigures {
  monthLabel: string | null;
  occPct: number | null;
  adr: number | null;
  revenue: number | null;
  roomNights: number | null;
}

/** The week's representative figures = its headline month (end-month if it has data, else latest). */
function headlineFigures(stats: HeadlineStat[], endDate: Date): HeadlineFigures {
  const endMonth = endDate.getUTCMonth() + 1;
  const chosen = headlineMonth(
    endMonth,
    stats.map((m) => ({ month: m.month, hasFigures: m.revActual !== null || m.occActual !== null })),
  );
  const s = chosen ? stats.find((m) => m.month === chosen) : undefined;
  return {
    monthLabel: chosen ? (MONTHS_SHORT[chosen - 1] ?? null) : null,
    occPct: s ? occPercent(dec(s.occActual)) : null,
    adr: s ? dec(s.arrActual) : null,
    revenue: s ? dec(s.revActual) : null,
    roomNights: s ? s.rnSold : null,
  };
}

export interface WeeklyTrendPoint {
  week: string;
  label: string;
  monthLabel: string | null;
  occPct: number | null;
  adr: number | null;
  revenue: number | null;
  roomNights: number | null;
  isSelected: boolean;
}

export interface WeeklyKpiDelta {
  label: string;
  value: string;
  /** Signed change vs the previous week (percent, or points for occupancy). */
  delta: number | null;
  deltaUnit: "%" | "pts";
  spark: number[];
}

export interface WeeklyComparisonRow {
  code: string;
  name: string;
  weekLabel: string | null;
  occPct: number | null;
  adr: number | null;
  revenue: number | null;
  /** True when this property has a report for the exact selected week. */
  matchesSelectedWeek: boolean;
}

export interface WeeklySocialTrendRow {
  platform: string;
  metric: string;
  lastWeek: number | null;
  thisWeek: number | null;
  growthPct: number | null;
}

export interface WeeklyTrendsData {
  property: { code: string; name: string };
  selectedWeek: string;
  series: WeeklyTrendPoint[];
  kpis: {
    occupancy: WeeklyKpiDelta;
    adr: WeeklyKpiDelta;
    revenue: WeeklyKpiDelta;
    roomNights: WeeklyKpiDelta;
  } | null;
  social: WeeklySocialTrendRow[];
  comparison: WeeklyComparisonRow[];
}

const STAT_SELECT = {
  orderBy: { month: "asc" as const },
  select: { month: true, rnSold: true, occActual: true, arrActual: true, revActual: true },
};

/** Build the Trends view model for a property + selected week, or null if the property is unknown. */
export async function getWeeklyTrendsData(
  propertyCode: string,
  week: string,
): Promise<WeeklyTrendsData | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    select: { code: true, name: true },
  });
  if (!property) return null;

  // ── Per-week series for this property (oldest → newest) ─────────────────────
  const reports = await prisma.weeklyReport.findMany({
    where: { property: { code: propertyCode } },
    orderBy: { endDate: "asc" },
    select: { endDate: true, label: true, monthlyStats: STAT_SELECT },
  });

  const series: WeeklyTrendPoint[] = reports.map((r) => {
    const id = weekIdOf(r.endDate);
    const f = headlineFigures(r.monthlyStats, r.endDate);
    return {
      week: id,
      label: r.label ?? weekLabel(id),
      monthLabel: f.monthLabel,
      occPct: f.occPct,
      adr: f.adr,
      revenue: f.revenue,
      roomNights: f.roomNights,
      isSelected: id === week,
    };
  });

  // ── KPI deltas anchored to the selected week vs the week before it ───────────
  const idx = series.findIndex((p) => p.week === week);
  let kpis: WeeklyTrendsData["kpis"] = null;
  if (idx >= 0) {
    const cur = series[idx]!;
    const prev = idx > 0 ? series[idx - 1] : undefined;
    const sparkOf = (pick: (p: WeeklyTrendPoint) => number | null): number[] =>
      series.slice(0, idx + 1).map(pick).filter((v): v is number => v !== null);
    const pctDelta = (pick: (p: WeeklyTrendPoint) => number | null): number | null =>
      prev ? delta(pick(cur), pick(prev)).pct : null;
    const ptsDelta = (pick: (p: WeeklyTrendPoint) => number | null): number | null => {
      if (!prev) return null;
      const a = pick(cur);
      const b = pick(prev);
      return a === null || b === null ? null : a - b;
    };
    const fmtIdr = (n: number | null) => (n === null ? "—" : formatIDR(n));
    kpis = {
      occupancy: { label: "Occupancy", value: cur.occPct === null ? "—" : `${cur.occPct.toFixed(1)}%`, delta: ptsDelta((p) => p.occPct), deltaUnit: "pts", spark: sparkOf((p) => p.occPct) },
      adr: { label: "ADR", value: fmtIdr(cur.adr), delta: pctDelta((p) => p.adr), deltaUnit: "%", spark: sparkOf((p) => p.adr) },
      revenue: { label: "Room Revenue", value: fmtIdr(cur.revenue), delta: pctDelta((p) => p.revenue), deltaUnit: "%", spark: sparkOf((p) => p.revenue) },
      roomNights: { label: "Room Nights", value: cur.roomNights === null ? "—" : formatNumber(cur.roomNights), delta: pctDelta((p) => p.roomNights), deltaUnit: "%", spark: sparkOf((p) => p.roomNights) },
    };
  }

  // ── Selected week's social movement ─────────────────────────────────────────
  const selectedReport = await prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    select: { socialMetrics: { orderBy: { sortOrder: "asc" }, select: { platform: true, metricKey: true, lastWeek: true, thisWeek: true } } },
  });
  const social: WeeklySocialTrendRow[] = (selectedReport?.socialMetrics ?? [])
    .filter((m) => m.thisWeek !== null || m.lastWeek !== null)
    .map((m) => ({
      platform: m.platform,
      metric: m.metricKey,
      lastWeek: m.lastWeek,
      thisWeek: m.thisWeek,
      growthPct: growthPercent(m.lastWeek, m.thisWeek),
    }));

  // ── Cross-property snapshot (selected week, falling back to each property's latest) ──
  const selectedDate = new Date(`${week}T00:00:00.000Z`);
  const allProps = await prisma.property.findMany({ orderBy: { code: "asc" }, select: { code: true, name: true } });
  const comparison: WeeklyComparisonRow[] = [];
  for (const p of allProps) {
    const exact = await prisma.weeklyReport.findFirst({
      where: { property: { code: p.code }, endDate: selectedDate },
      select: { endDate: true, label: true, monthlyStats: STAT_SELECT },
    });
    const report =
      exact ??
      (await prisma.weeklyReport.findFirst({
        where: { property: { code: p.code } },
        orderBy: { endDate: "desc" },
        select: { endDate: true, label: true, monthlyStats: STAT_SELECT },
      }));
    if (!report) {
      comparison.push({ code: p.code, name: p.name, weekLabel: null, occPct: null, adr: null, revenue: null, matchesSelectedWeek: false });
      continue;
    }
    const f = headlineFigures(report.monthlyStats, report.endDate);
    comparison.push({
      code: p.code,
      name: p.name,
      weekLabel: report.label ?? weekLabel(weekIdOf(report.endDate)),
      occPct: f.occPct,
      adr: f.adr,
      revenue: f.revenue,
      matchesSelectedWeek: Boolean(exact),
    });
  }

  return { property, selectedWeek: week, series, kpis, social, comparison };
}
