/**
 * Builds a compact, pre-formatted JSON context for the weekly Section A
 * narrative blocks (Phase 7).
 *
 * Mirrors the monthly `lib/ai/context.ts` approach: every money/percentage
 * value is pre-formatted here (IDR compact, 1-dp percentages, signed
 * variances, occupancy as points) so the model only ever *quotes* a figure —
 * it is never asked to compute or reformat one, which is what keeps it from
 * inventing values. The block key selects which figure groups matter; the same
 * grounded snapshot is handed to every block so nothing is fabricated.
 */

import { formatIDRCompact, formatNumber } from "@/lib/format";
import {
  channelYtd,
  headlineMonth,
  monthlyTotals,
  occPercent,
  productionTotals,
  rate,
  sharePercent,
  variancePercent,
} from "@/lib/weekly/calculations";
import { formatWeeklyPercent, formatWeeklyVariance } from "@/lib/weekly/format";
import { prisma } from "@/lib/prisma";
import { weekLabel } from "@/lib/weekly/week";

export interface WeeklyNarrativeContext {
  block: string;
  property: { code: string; name: string; area: string };
  week: string;
  headlineMonthLabel: string | null;
  data: unknown;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const dec = (v: { toNumber(): number } | null): number | null =>
  v === null ? null : v.toNumber();

const money = (n: number | null | undefined) =>
  n == null ? "—" : formatIDRCompact(n);
const num = (n: number | null | undefined) =>
  n == null ? "—" : formatNumber(n);
const pct = (n: number | null | undefined) =>
  n == null ? "—" : formatWeeklyPercent(n);
const varPct = (actual: number | null, compare: number | null) =>
  formatWeeklyVariance(variancePercent(actual, compare));

/** Occupancy variance in percentage points, signed, e.g. "-6.1 pts". */
function occPoints(actualFraction: number | null, compareFraction: number | null): string {
  const a = occPercent(actualFraction);
  const b = occPercent(compareFraction);
  if (a === null || b === null) return "—";
  const d = a - b;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)} pts`;
}

/**
 * Build the pre-formatted weekly narrative context, or null if the property or
 * the week's report cannot be found.
 */
export async function buildWeeklyContext(
  propertyCode: string,
  week: string,
  block: string,
): Promise<WeeklyNarrativeContext | null> {
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    select: { code: true, name: true, area: true },
  });
  if (!property) return null;

  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    include: {
      monthlyStats: { orderBy: { month: "asc" } },
      segmentProductions: { orderBy: { sortOrder: "asc" } },
      channelRns: { orderBy: { sortOrder: "asc" } },
      socialMetrics: { orderBy: { sortOrder: "asc" } },
    },
  });

  const base = {
    block,
    property,
    week: report?.label ?? weekLabel(week),
  };

  if (!report) {
    return {
      ...base,
      headlineMonthLabel: null,
      data: { note: "No report exists for this week yet — no figures are available." },
    };
  }

  // Headline month = the week's end-date month if it has figures, else the
  // latest month that does (identical rule to the dashboard KPI row).
  const endMonth = report.endDate.getUTCMonth() + 1;
  const chosen = headlineMonth(
    endMonth,
    report.monthlyStats.map((m) => ({
      month: m.month,
      hasFigures: m.revActual !== null || m.occActual !== null,
    })),
  );
  const head = chosen ? report.monthlyStats.find((m) => m.month === chosen) : undefined;
  const headlineMonthLabel = chosen ? (MONTHS_SHORT[chosen - 1] ?? null) : null;

  // ── Financial: headline-month occupancy / ADR / revenue vs budget & LY ──────
  const financial = head
    ? {
        month: headlineMonthLabel,
        roomNightsSold: num(head.rnSold),
        occupancy: {
          actual: pct(occPercent(dec(head.occActual))),
          budget: pct(occPercent(dec(head.occBudget))),
          lastYear: pct(occPercent(dec(head.occLy))),
          vsBudget: occPoints(dec(head.occActual), dec(head.occBudget)),
          vsLastYear: occPoints(dec(head.occActual), dec(head.occLy)),
        },
        averageRoomRate: {
          actual: money(dec(head.arrActual)),
          budget: money(dec(head.arrBudget)),
          lastYear: money(dec(head.arrLy)),
          vsBudget: varPct(dec(head.arrActual), dec(head.arrBudget)),
          vsLastYear: varPct(dec(head.arrActual), dec(head.arrLy)),
        },
        roomRevenue: {
          actual: money(dec(head.revActual)),
          budget: money(dec(head.revBudget)),
          lastYear: money(dec(head.revLy)),
          achievement: pct(sharePercent(dec(head.revActual), dec(head.revBudget))),
          vsBudget: varPct(dec(head.revActual), dec(head.revBudget)),
          vsLastYear: varPct(dec(head.revActual), dec(head.revLy)),
        },
      }
    : null;

  // ── Year-to-date room revenue & blended ARR across all months with data ─────
  const ytdSource = report.monthlyStats.map((m) => ({
    rnSold: m.rnSold,
    revActual: dec(m.revActual),
    revBudget: dec(m.revBudget),
    revLy: dec(m.revLy),
  }));
  const t = monthlyTotals(ytdSource);
  const ytd =
    report.monthlyStats.length > 0
      ? {
          roomNightsSold: num(t.rnSold),
          roomRevenue: {
            actual: money(t.revActual),
            budget: money(t.revBudget),
            lastYear: money(t.revLy),
            achievement: pct(sharePercent(t.revActual, t.revBudget)),
            vsBudget: varPct(t.revActual, t.revBudget),
            vsLastYear: varPct(t.revActual, t.revLy),
          },
          averageRoomRate: {
            actual: money(t.arrActual),
            budget: money(t.arrBudget),
            lastYear: money(t.arrLy),
          },
        }
      : null;

  // ── Weekly market segment production (top by revenue) ───────────────────────
  const segTotals = productionTotals(
    report.segmentProductions.map((s) => ({ rnSold: s.rnSold, grossRevenue: dec(s.grossRevenue) })),
  );
  const segments = report.segmentProductions
    .map((s) => ({ revenue: dec(s.grossRevenue), row: s }))
    .sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0))
    .slice(0, 8)
    .map(({ revenue, row }) => ({
      segment: row.label,
      group: row.segmentGroup,
      roomNights: num(row.rnSold),
      revenue: money(revenue),
      averageRate: money(rate(revenue, row.rnSold)),
      shareOfRevenue: pct(sharePercent(revenue, segTotals.revenue)),
    }));

  // ── Channel room-night production, current-year YTD (top by volume) ─────────
  const channelRows = report.channelRns
    .filter((c) => c.year === report.year)
    .map((c) => ({
      source: c.sourceLabel,
      _ytd: channelYtd([
        c.jan, c.feb, c.mar, c.apr, c.may, c.jun,
        c.jul, c.aug, c.sep, c.oct, c.nov, c.dec,
      ]),
    }));
  const channelTotal = channelRows.reduce((s, c) => s + c._ytd, 0);
  const channels = channelRows
    .sort((a, b) => b._ytd - a._ytd)
    .slice(0, 8)
    .map((c) => ({
      source: c.source,
      ytdRoomNights: num(c._ytd),
      shareOfRoomNights: pct(sharePercent(c._ytd, channelTotal)),
    }));

  // ── Social media week-over-week movement ────────────────────────────────────
  const social = report.socialMetrics
    .filter((m) => m.thisWeek !== null || m.lastWeek !== null)
    .map((m) => ({
      platform: m.platform,
      metric: m.metricKey,
      lastWeek: num(m.lastWeek),
      thisWeek: num(m.thisWeek),
      change: varPct(m.thisWeek, m.lastWeek),
    }));

  const hasAny = financial || ytd || segments.length || channels.length || social.length;

  return {
    ...base,
    headlineMonthLabel,
    data: hasAny
      ? { headlineMonth: headlineMonthLabel, financial, ytd, segments, channels, social }
      : { note: "No figures have been imported for this week yet." },
  };
}
