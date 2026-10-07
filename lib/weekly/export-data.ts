import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";
import {
  channelYtd,
  growth,
  growthPercent,
  headlineMonth,
  monthlyTotals,
  productionTotals,
  rate,
  sharePercent,
  type MonthlyTotals,
  type ProductionTotals,
} from "@/lib/weekly/calculations";
import { getWeeklyAds, type WeeklyAdsData } from "@/lib/weekly/ads-data";
import { OVERVIEW_BLOCKS } from "@/lib/weekly/editor-data";
import { weekLabel } from "@/lib/weekly/week";

/**
 * One aggregated, render-neutral view model for a weekly report, shared by
 * every export format (PDF print route, Excel, Word). Raw numbers are kept as
 * `number | null` so Excel can write real numeric cells; each generator formats
 * as it needs. Derived figures (ARR, shares, YTD, growth) come from the pure
 * weekly calculation helpers — nothing is persisted.
 */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const dec = (v: { toNumber(): number } | null): number | null =>
  v === null ? null : v.toNumber();

export interface WeeklyMonthlyRow {
  month: number;
  monthLabel: string;
  rnSold: number | null;
  occActual: number | null;
  occBudget: number | null;
  occLy: number | null;
  arrActual: number | null;
  arrBudget: number | null;
  arrLy: number | null;
  revActual: number | null;
  revBudget: number | null;
  revLy: number | null;
}

export interface WeeklyProductionRow {
  label: string;
  group: string | null;
  rnSold: number | null;
  grossRevenue: number | null;
  arr: number | null;
  share: number | null;
}

export interface WeeklyChannelRow {
  year: number;
  source: string;
  months: number[];
  ytd: number;
  share: number | null;
}

export interface WeeklySocialRow {
  platform: string;
  metric: string;
  lastWeek: number | null;
  thisWeek: number | null;
  growth: number | null;
  growthPct: number | null;
}

export interface WeeklyScreenshotExport {
  id: string;
  category: string;
  title: string | null;
  imageUrl: string;
  imageKey: string;
  summary: string | null;
}

export interface WeeklyExportData {
  property: { code: string; name: string; area: string };
  week: {
    id: string;
    label: string;
    status: string;
    startDate: string;
    endDate: string;
    year: number;
    weekNumber: number;
  };
  headlineMonthLabel: string | null;
  overview: { key: string; heading: string; body: string | null; aiDraft: boolean }[];
  monthly: { rows: WeeklyMonthlyRow[]; totals: MonthlyTotals };
  segments: { rows: WeeklyProductionRow[]; totals: ProductionTotals };
  rateCodes: { rows: WeeklyProductionRow[]; totals: ProductionTotals };
  channels: { rows: WeeklyChannelRow[]; ytdTotal: number };
  social: WeeklySocialRow[];
  screenshots: WeeklyScreenshotExport[];
  ads: WeeklyAdsData;
  departments: {
    sales: { dateLabel: string | null; title: string | null; notes: string | null }[];
    ecommerce: { dateLabel: string | null; title: string | null; notes: string | null }[];
    trainings: {
      dateLabel: string | null;
      topic: string;
      duration: string | null;
      trainer: string | null;
      participants: string | null;
    }[];
    actionPlans: {
      category: string | null;
      plan: string;
      startLabel: string | null;
      deadlineLabel: string | null;
      remark: string | null;
    }[];
  };
}

/** Assemble the full export view model for one property + week, or null. */
export async function getWeeklyExportData(
  propertyCode: string,
  week: string,
): Promise<WeeklyExportData | null> {
  noStore();
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    select: { code: true, name: true, area: true },
  });
  if (!property) return null;

  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    include: {
      overviewBlocks: true,
      monthlyStats: { orderBy: { month: "asc" } },
      segmentProductions: { orderBy: { sortOrder: "asc" } },
      rateCodeProductions: { orderBy: { sortOrder: "asc" } },
      channelRns: { orderBy: { sortOrder: "asc" } },
      socialMetrics: { orderBy: { sortOrder: "asc" } },
      activities: { orderBy: { sortOrder: "asc" } },
      trainings: { orderBy: { sortOrder: "asc" } },
      actionPlans: { orderBy: { sortOrder: "asc" } },
      screenshots: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!report) return null;

  // ── Overview (all 7 blocks in report order) ─────────────────────────────────
  const byKey = new Map(report.overviewBlocks.map((b) => [b.key, b]));
  const overview = OVERVIEW_BLOCKS.map((def) => {
    const existing = byKey.get(def.key);
    return {
      key: def.key,
      heading: def.heading,
      body: existing?.body ?? null,
      aiDraft: existing?.aiDraft ?? false,
    };
  });

  // ── Section B: monthly Actual / Budget / Last Year ──────────────────────────
  const monthlyRows: WeeklyMonthlyRow[] = report.monthlyStats.map((m) => ({
    month: m.month,
    monthLabel: MONTHS_SHORT[m.month - 1] ?? String(m.month),
    rnSold: m.rnSold,
    occActual: dec(m.occActual),
    occBudget: dec(m.occBudget),
    occLy: dec(m.occLy),
    arrActual: dec(m.arrActual),
    arrBudget: dec(m.arrBudget),
    arrLy: dec(m.arrLy),
    revActual: dec(m.revActual),
    revBudget: dec(m.revBudget),
    revLy: dec(m.revLy),
  }));
  const monthlyTotalsRow = monthlyTotals(
    monthlyRows.map((r) => ({
      rnSold: r.rnSold,
      revActual: r.revActual,
      revBudget: r.revBudget,
      revLy: r.revLy,
    })),
  );

  const endMonth = report.endDate.getUTCMonth() + 1;
  const chosen = headlineMonth(
    endMonth,
    monthlyRows.map((m) => ({
      month: m.month,
      hasFigures: m.revActual !== null || m.occActual !== null,
    })),
  );
  const headlineMonthLabel = chosen ? (MONTHS_SHORT[chosen - 1] ?? null) : null;

  // ── Section C: market segment production ────────────────────────────────────
  const segTotals = productionTotals(
    report.segmentProductions.map((s) => ({ rnSold: s.rnSold, grossRevenue: dec(s.grossRevenue) })),
  );
  const segmentRows: WeeklyProductionRow[] = report.segmentProductions.map((s) => {
    const revenue = dec(s.grossRevenue);
    return {
      label: s.label,
      group: s.segmentGroup,
      rnSold: s.rnSold,
      grossRevenue: revenue,
      arr: rate(revenue, s.rnSold),
      share: sharePercent(revenue, segTotals.revenue),
    };
  });

  // ── Section D: rate code / promotion production ─────────────────────────────
  const rcTotals = productionTotals(
    report.rateCodeProductions.map((r) => ({ rnSold: r.rnSold, grossRevenue: dec(r.grossRevenue) })),
  );
  const rateCodeRows: WeeklyProductionRow[] = report.rateCodeProductions.map((r) => {
    const revenue = dec(r.grossRevenue);
    return {
      label: r.label,
      group: null,
      rnSold: r.rnSold,
      grossRevenue: revenue,
      arr: rate(revenue, r.rnSold),
      share: sharePercent(revenue, rcTotals.revenue),
    };
  });

  // ── Sections E/F: channel room nights, current year ─────────────────────────
  const channelSource = report.channelRns
    .filter((c) => c.year === report.year)
    .map((c) => {
      const months = [
        c.jan, c.feb, c.mar, c.apr, c.may, c.jun,
        c.jul, c.aug, c.sep, c.oct, c.nov, c.dec,
      ];
      return { year: c.year, source: c.sourceLabel, months, ytd: channelYtd(months) };
    });
  const channelYtdTotal = channelSource.reduce((s, c) => s + c.ytd, 0);
  const channelRows: WeeklyChannelRow[] = channelSource.map((c) => ({
    ...c,
    share: sharePercent(c.ytd, channelYtdTotal),
  }));

  // ── Section H: social media ─────────────────────────────────────────────────
  const social: WeeklySocialRow[] = report.socialMetrics.map((m) => ({
    platform: m.platform,
    metric: m.metricKey,
    lastWeek: m.lastWeek,
    thisWeek: m.thisWeek,
    growth: growth(m.lastWeek, m.thisWeek),
    growthPct: growthPercent(m.lastWeek, m.thisWeek),
  }));

  // ── Department inputs (G/G2/I/J) ────────────────────────────────────────────
  const activities = (dept: string) =>
    report.activities
      .filter((a) => a.department === dept)
      .map((a) => ({ dateLabel: a.dateLabel, title: a.title, notes: a.notes }));

  const ads = await getWeeklyAds(propertyCode, week);

  return {
    property,
    week: {
      id: week,
      label: report.label ?? weekLabel(week),
      status: report.status,
      startDate: report.startDate.toISOString().slice(0, 10),
      endDate: report.endDate.toISOString().slice(0, 10),
      year: report.year,
      weekNumber: report.weekNumber,
    },
    headlineMonthLabel,
    overview,
    monthly: { rows: monthlyRows, totals: monthlyTotalsRow },
    segments: { rows: segmentRows, totals: segTotals },
    rateCodes: { rows: rateCodeRows, totals: rcTotals },
    channels: { rows: channelRows, ytdTotal: channelYtdTotal },
    social,
    screenshots: report.screenshots.map((s) => ({
      id: s.id,
      category: s.category,
      title: s.title,
      imageUrl: s.imageUrl,
      imageKey: s.imageKey,
      summary: s.summary,
    })),
    ads,
    departments: {
      sales: activities("sales"),
      ecommerce: activities("ecommerce"),
      trainings: report.trainings.map((t) => ({
        dateLabel: t.dateLabel,
        topic: t.topic,
        duration: t.duration,
        trainer: t.trainer,
        participants: t.participants,
      })),
      actionPlans: report.actionPlans.map((a) => ({
        category: a.category,
        plan: a.plan,
        startLabel: a.startLabel,
        deadlineLabel: a.deadlineLabel,
        remark: a.remark,
      })),
    },
  };
}
