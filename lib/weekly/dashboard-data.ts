import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";
import { type PropertyOption } from "@/lib/dashboard-data";
import {
  channelYtd,
  headlineMonth,
  occPercent,
  variancePercent,
} from "@/lib/weekly/calculations";
import { currentWeekId } from "@/lib/weekly/week";

/**
 * Server-side data access for the Weekly Reports module. Reads raw rows from
 * Postgres and shapes them into plain-number view models (Prisma `Decimal` →
 * `number`); derived metrics come from lib/weekly/calculations.
 */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dec(v: { toNumber(): number } | null): number | null {
  return v === null ? null : v.toNumber();
}

function weekIdOf(endDate: Date): string {
  return endDate.toISOString().slice(0, 10);
}

export interface WeeklyWeekOption {
  week: string; // yyyy-mm-dd (end date)
  label: string;
  status: string;
}

export interface WeeklyShellData {
  properties: PropertyOption[];
  weeksByProperty: Record<string, WeeklyWeekOption[]>;
  defaultPath: string;
}

/** Everything the Weekly shell needs: properties, their weeks, and a landing path. */
export async function getWeeklyShellData(): Promise<WeeklyShellData> {
  noStore();
  const properties = await prisma.property.findMany({
    orderBy: { code: "asc" },
    select: {
      code: true,
      name: true,
      weeklyReports: {
        orderBy: { endDate: "desc" },
        select: { endDate: true, label: true, status: true },
      },
    },
  });

  const weeksByProperty: Record<string, WeeklyWeekOption[]> = {};
  for (const p of properties) {
    weeksByProperty[p.code] = p.weeklyReports.map((w) => ({
      week: weekIdOf(w.endDate),
      label: w.label ?? weekIdOf(w.endDate),
      status: w.status,
    }));
  }

  let defaultPath: string;
  const withData = properties.find((p) => p.weeklyReports.length > 0);
  if (withData) {
    defaultPath = `/weekly/${withData.code}/${weekIdOf(withData.weeklyReports[0]!.endDate)}/dashboard`;
  } else {
    const first = properties[0]?.code ?? "BKDS";
    defaultPath = `/weekly/${first}/${currentWeekId()}/dashboard`;
  }

  return {
    properties: properties.map((p) => ({ code: p.code, name: p.name })),
    weeksByProperty,
    defaultPath,
  };
}

export interface WeeklyKpi {
  label: string;
  value: string; // preformatted
  budgetValue: string;
  deltaPct: number | null;
  deltaUnit: "%" | "pts";
  lastYearDeltaPct: number | null;
}

export interface WeeklyProgressItem {
  key: string;
  title: string;
  done: boolean;
}

export interface WeeklyDashboardData {
  property: { code: string; name: string };
  week: { id: string; label: string; status: string } | null;
  headlineMonthLabel: string | null;
  /** Raw headline numbers for the KPI row (view builds the strings). */
  headline: {
    occActual: number | null;
    occBudget: number | null;
    occLy: number | null;
    arrActual: number | null;
    arrBudget: number | null;
    arrLy: number | null;
    revActual: number | null;
    revBudget: number | null;
    revLy: number | null;
    rnSold: number | null;
  } | null;
  /** Month-by-month room revenue (Actual vs Budget) for the bar chart. */
  monthlyRevenue: { label: string; actual: number; budget: number }[];
  /** Channel mix — current-year YTD room nights per source. */
  channelMix: { label: string; value: number }[];
  progress: WeeklyProgressItem[];
}

/** The weekly dashboard view model for one property + week. Null if not found. */
export async function getWeeklyDashboardData(
  propertyCode: string,
  week: string,
): Promise<WeeklyDashboardData | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    select: { code: true, name: true },
  });
  if (!property) return null;

  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    include: {
      monthlyStats: { orderBy: { month: "asc" } },
      channelRns: { orderBy: { sortOrder: "asc" } },
      segmentProductions: { select: { id: true } },
      overviewBlocks: { select: { body: true } },
      socialMetrics: { select: { thisWeek: true } },
    },
  });

  // No report for this week yet — return an empty, render-safe shell.
  if (!report) {
    return {
      property,
      week: null,
      headlineMonthLabel: null,
      headline: null,
      monthlyRevenue: [],
      channelMix: [],
      progress: [],
    };
  }

  // Headline month = end-date month if it has figures, else latest with figures.
  const endMonth = report.endDate.getUTCMonth() + 1;
  const chosen = headlineMonth(
    endMonth,
    report.monthlyStats.map((m) => ({
      month: m.month,
      hasFigures: m.revActual !== null || m.occActual !== null,
    })),
  );
  const headStat = chosen
    ? report.monthlyStats.find((m) => m.month === chosen)
    : undefined;

  const headline = headStat
    ? {
        occActual: dec(headStat.occActual),
        occBudget: dec(headStat.occBudget),
        occLy: dec(headStat.occLy),
        arrActual: dec(headStat.arrActual),
        arrBudget: dec(headStat.arrBudget),
        arrLy: dec(headStat.arrLy),
        revActual: dec(headStat.revActual),
        revBudget: dec(headStat.revBudget),
        revLy: dec(headStat.revLy),
        rnSold: headStat.rnSold,
      }
    : null;

  const monthlyRevenue = report.monthlyStats
    .map((m) => ({
      label: MONTHS_SHORT[m.month - 1] ?? String(m.month),
      actual: dec(m.revActual) ?? 0,
      budget: dec(m.revBudget) ?? 0,
    }))
    .filter((r) => r.actual > 0 || r.budget > 0);

  const channelMix = report.channelRns
    .filter((c) => c.year === report.year)
    .map((c) => ({
      label: c.sourceLabel,
      value: channelYtd([
        c.jan, c.feb, c.mar, c.apr, c.may, c.jun,
        c.jul, c.aug, c.sep, c.oct, c.nov, c.dec,
      ]),
    }))
    .filter((c) => c.value > 0);

  const overviewHasBody = report.overviewBlocks.some(
    (b) => b.body !== null && b.body.trim() !== "",
  );
  const socialHasData = report.socialMetrics.some((s) => s.thisWeek !== null);

  const progress: WeeklyProgressItem[] = [
    { key: "A", title: "Sales & Marketing Overview", done: overviewHasBody },
    { key: "B", title: "YTD Actual / Budget / Last Year", done: report.monthlyStats.length > 0 },
    { key: "C", title: "Weekly Market Segment", done: report.segmentProductions.length > 0 },
    { key: "E/F", title: "Channel Inside (Room Nights)", done: report.channelRns.length > 0 },
    { key: "H", title: "Social Media Insight", done: socialHasData },
    { key: "J", title: "Next Week Action Plan", done: false },
  ];

  return {
    property,
    week: {
      id: week,
      label: report.label ?? week,
      status: report.status,
    },
    headlineMonthLabel: chosen ? (MONTHS_SHORT[chosen - 1] ?? null) : null,
    headline,
    monthlyRevenue,
    channelMix,
    progress,
  };
}

/** Variance % vs budget and vs last year for the KPI chips. */
export function kpiVariances(
  actual: number | null,
  budget: number | null,
  ly: number | null,
): { vsBudget: number | null; vsLy: number | null } {
  return {
    vsBudget: variancePercent(actual, budget),
    vsLy: variancePercent(actual, ly),
  };
}

/** Occupancy delta in percentage points (not a ratio). */
export function occPointsDelta(
  actualFraction: number | null,
  budgetFraction: number | null,
): number | null {
  const a = occPercent(actualFraction);
  const b = occPercent(budgetFraction);
  return a === null || b === null ? null : a - b;
}
