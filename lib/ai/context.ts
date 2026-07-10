/**
 * Builds a compact, pre-formatted JSON context per narrative section (Phase 13).
 *
 * Every money/percentage value is pre-formatted here (IDR compact, 2-dp
 * percentages, signed variances) so the model only has to *quote* figures — it
 * is never asked to compute or format a number, which is what keeps it from
 * inventing values. Reuses the same aggregated fetchers the dashboard pages use.
 */

import { achievementPct, variancePct } from "@/lib/calculations";
import {
  getMarketingPageData,
  getRestaurantPageData,
  getRoomTypesPageData,
  getSocialPageData,
  getSpaPageData,
  getSummaryPageData,
  type MetricAB,
  type RevenueLine,
} from "@/lib/dashboard-data";
import { formatIDRCompact, formatNumber, formatPercent, formatRatioPct, formatVariancePercent } from "@/lib/format";
import { getGroupData, type GroupKpiCell } from "@/lib/group-data";
import { periodLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export interface NarrativeContext {
  section: string;
  property: { code: string; name: string; area: string; restaurantName: string; spaName: string };
  period: string;
  data: unknown;
}

// ── formatting helpers ───────────────────────────────────────────────────────

const money = (n: number | null | undefined) => (n == null ? "—" : formatIDRCompact(n));
const num = (n: number | null | undefined) => (n == null ? "—" : formatNumber(n));

/** Actual vs budget for an IDR amount, with achievement and signed variance. */
function moneyAB(m: MetricAB) {
  return {
    actual: money(m.actual),
    budget: money(m.budget),
    achievement: fmtPct(achievementPct(m.actual, m.budget)),
    variance: fmtVar(variancePct(m.actual, m.budget)),
  };
}
function countAB(m: MetricAB) {
  return {
    actual: num(m.actual),
    budget: num(m.budget),
    achievement: fmtPct(achievementPct(m.actual, m.budget)),
    variance: fmtVar(variancePct(m.actual, m.budget)),
  };
}
const fmtPct = (n: number | null) => (n == null ? "—" : formatPercent(n));
const fmtVar = (n: number | null) => (n == null ? "—" : formatVariancePercent(n));

/** A RevenueSummary line (occupancy is a ratio → points; the rest are IDR). */
function fmtLine(l: RevenueLine) {
  const ach = achievementPct(l.actual, l.budget);
  if (l.format === "ratio") {
    const pts = (l.actual - l.budget) * 100;
    return {
      metric: l.label,
      actual: formatRatioPct(l.actual),
      budget: formatRatioPct(l.budget),
      lastYear: l.lastYear != null ? formatRatioPct(l.lastYear) : null,
      achievement: fmtPct(ach),
      variance: `${pts >= 0 ? "+" : ""}${pts.toFixed(2)} pts`,
    };
  }
  return {
    metric: l.label,
    actual: money(l.actual),
    budget: money(l.budget),
    lastYear: l.lastYear != null ? money(l.lastYear) : null,
    achievement: fmtPct(ach),
    variance: fmtVar(variancePct(l.actual, l.budget)),
  };
}

const ROOMS_DEPTS = ["OCCUPANCY", "ADR", "REVPAR", "ROOM_REVENUE"];
const OUTLET_DEPTS = ["FNB", "SPA_WELLNESS", "GALLERY", "OOD"];

// ── section builders ─────────────────────────────────────────────────────────

async function summaryContext(code: string, period: string) {
  const d = await getSummaryPageData(code, period);
  if (!d || !d.hasData) return null;
  const lines = d.revenueLines;
  return {
    rooms: lines.filter((l) => ROOMS_DEPTS.includes(l.department)).map(fmtLine),
    departments: lines.filter((l) => OUTLET_DEPTS.includes(l.department)).map(fmtLine),
    totalRevenue: lines.filter((l) => l.department === "TOTAL_REVENUE").map(fmtLine)[0] ?? null,
  };
}

async function roomTypeContext(code: string, period: string) {
  const d = await getRoomTypesPageData(code, period);
  if (!d || !d.hasData) return null;
  return {
    roomTypes: d.roomTypes.map((r) => ({
      roomType: r.roomTypeName,
      roomNights: countAB({ actual: r.roomNightsActual, budget: r.roomNightsBudget }),
      adr: moneyAB({ actual: r.adrActual, budget: r.adrBudget }),
      revenue: {
        ...moneyAB({ actual: r.revenueActual, budget: r.revenueBudget }),
        gapVsBudget: money(r.revenueActual - r.revenueBudget),
      },
    })),
  };
}

async function restaurantContext(code: string, period: string) {
  const d = await getRestaurantPageData(code, period);
  if (!d || !d.hasData) return null;
  return {
    restaurant: d.property.restaurantName,
    overview: d.overview
      ? {
          covers: countAB(d.overview.covers),
          revenue: moneyAB(d.overview.revenue),
          averageCheck: {
            actual: money(d.overview.avgCheckActual),
            budget: money(d.overview.avgCheckBudget),
          },
          revenueAchievement: fmtPct(d.overview.revenueAchievementPct),
        }
      : null,
    mealPeriods: d.meals.map((m) => ({
      meal: m.meal,
      covers: countAB({ actual: m.coversActual, budget: m.coversBudget }),
      averageCheck: { actual: money(m.avgCheckActual), budget: money(m.avgCheckBudget) },
      revenue: moneyAB({ actual: m.revenueActual, budget: m.revenueBudget }),
      shareOfRevenue: `${m.pctOfRevenue.toFixed(1)}%`,
    })),
    topSources: d.sources.slice(0, 8).map((s) => ({
      source: s.sourceName,
      category: s.category,
      persons: num(s.persons),
      shareOfPersons: `${s.pctPersons.toFixed(1)}%`,
      averageCheck: money(s.avgCheck),
      revenue: money(s.revenue),
    })),
    chope: d.chope
      ? {
          fulfilledBookings: num(d.chope.fulfilledBookings),
          fulfilledCovers: num(d.chope.fulfilledCovers),
          cancelledBookings: num(d.chope.cancelledBookings),
          noShows: num(d.chope.noShows),
          revenue: money(d.chope.revenue),
          shareOfRestaurantRevenue: d.chope.pctOfRestaurantRevenue != null ? `${d.chope.pctOfRestaurantRevenue.toFixed(1)}%` : "—",
          platformBookings: num(d.chope.platformBookings),
          directBookings: num(d.chope.directBookings),
        }
      : null,
    gokai: d.gokai ? gokaiContext(d.gokai) : null,
  };
}

async function spaContext(code: string, period: string) {
  const d = await getSpaPageData(code, period);
  if (!d || !d.hasData) return null;
  const SEG: Record<string, string> = { IN_HOUSE: "In-House", OUTSIDE: "Outside", INCLUSION: "Inclusion" };
  return {
    spa: d.property.spaName,
    overview: d.overview
      ? {
          covers: countAB(d.overview.covers),
          revenue: moneyAB(d.overview.revenue),
          averageCheck: { actual: money(d.overview.avgCheckActual), budget: money(d.overview.avgCheckBudget) },
          revenueAchievement: fmtPct(d.overview.revenueAchievementPct),
        }
      : null,
    segments: d.segments.map((s) => ({
      segment: SEG[s.segment] ?? s.segment,
      covers: countAB({ actual: s.coversActual, budget: s.coversBudget }),
      averageCheck: { actual: money(s.avgCheckActual), budget: money(s.avgCheckBudget) },
      revenue: moneyAB({ actual: s.revenueActual, budget: s.revenueBudget }),
    })),
    topTreatments: d.treatments.map((t) => ({
      rank: t.rank,
      treatment: t.treatmentName,
      count: num(t.count),
      revenue: money(t.revenue),
      averagePrice: money(t.avgPrice),
    })),
    gokai: d.gokai ? gokaiContext(d.gokai) : null,
  };
}

function gokaiContext(g: { unit: string; metrics: { label: string; value: number; format: "number" | "pct" | "idr"; mom: number | null }[] }) {
  return {
    unit: g.unit,
    metrics: g.metrics.map((m) => ({
      metric: m.label,
      value: m.format === "idr" ? money(m.value) : m.format === "pct" ? formatPercent(m.value) : num(m.value),
      momChange: m.mom != null ? formatVariancePercent(m.mom) : "—",
    })),
  };
}

async function adsContext(code: string, period: string) {
  const d = await getMarketingPageData(code, period);
  if (!d || !d.hasData || !d.ads) return null;
  const a = d.ads;
  return {
    totalSpend: money(a.totalSpend),
    trackedRevenue: money(a.trackedRevenue),
    roas: a.roasPct != null ? `${a.roasPct.toFixed(0)}%` : "—",
    returnPerRupiah: a.roasRatio != null ? `Rp ${a.roasRatio.toFixed(2)} returned per Rp 1 spent` : "—",
    totalClicks: num(a.totalClicks),
    platforms: a.platforms.map((p) => ({
      platform: p.platform,
      spend: money(p.spend),
      impressions: num(p.impressions),
      clicks: num(p.clicks),
      trackedRevenue: money(p.trackedRevenue),
      ctr: p.ctr != null ? formatPercent(p.ctr) : "—",
      cpc: money(p.cpc),
    })),
  };
}

async function socialContext(code: string, period: string) {
  const d = await getSocialPageData(code, period);
  if (!d || !d.hasData) return null;
  const UNIT: Record<string, string> = { HOTEL: "Hotel", RESTAURANT: "Restaurant", SPA: "Spa" };
  return {
    units: d.units
      .filter((u) => u.hasData)
      .map((u) => ({
        unit: UNIT[u.unit] ?? u.unit,
        summary: u.summary,
        platforms: u.platforms
          .filter((p) => p.hasData)
          .map((p) => ({
            platform: p.platform,
            metrics: p.metrics.map((m) => ({
              metric: m.label,
              value: num(m.value),
              momChange: m.mom != null ? formatVariancePercent(m.mom) : "—",
            })),
          })),
      })),
  };
}

// ── dispatch ─────────────────────────────────────────────────────────────────

const RICH_BUILDERS: Record<string, (code: string, period: string) => Promise<unknown>> = {
  SUMMARY: summaryContext,
  ROOMTYPE_ANALYSIS: roomTypeContext,
  RESTAURANT_OVERVIEW: restaurantContext,
  SPA_OVERVIEW: spaContext,
  ADS_SUMMARY: adsContext,
  SOCIAL_SUMMARY: socialContext,
};

/** Build the section-specific pre-formatted context, or null if the property is unknown. */
/** Cross-property comparison context for the AI Group summary. */
async function groupContext(period: string): Promise<NarrativeContext> {
  const g = await getGroupData(period);
  const meta = { code: "GROUP", name: "Blue Karma Group", area: "Bali", restaurantName: "", spaName: "" };
  if (!g.hasData) {
    return { section: "GROUP_SUMMARY", property: meta, period: periodLabel(period), data: { note: "No data imported for any property this period." } };
  }
  const cellFmt = (c: GroupKpiCell, format: "ratio" | "idr") => ({
    actual: c.actual == null ? "—" : format === "ratio" ? formatRatioPct(c.actual) : money(c.actual),
    budget: c.budget == null ? "—" : format === "ratio" ? formatRatioPct(c.budget) : money(c.budget),
    achievement: c.achievement == null ? "—" : formatPercent(c.achievement),
  });
  const l = g.leaderboards;
  return {
    section: "GROUP_SUMMARY",
    property: meta,
    period: periodLabel(period),
    data: {
      properties: g.properties.map((p) => ({
        code: p.code,
        name: p.name,
        roomCount: p.roomCount,
        kpis: Object.fromEntries(g.kpis.map((k) => [k.label, cellFmt(k.perProperty[p.code] ?? { actual: null, budget: null, achievement: null }, k.format)])),
      })),
      group: Object.fromEntries(g.kpis.map((k) => [k.label, cellFmt(k.group, k.format)])),
      leaderboards: {
        bestRoasCampaign: l.bestRoas ? `${l.bestRoas.property} ${l.bestRoas.unit} ${l.bestRoas.platform}: ${l.bestRoas.roasPct.toFixed(0)}%` : "—",
        bestTripadvisor: l.bestTripadvisor ? `${l.bestTripadvisor.property}: #${l.bestTripadvisor.rank}` : "—",
        biggestSocialGrowth: l.bestSocial ? `${l.bestSocial.property}: reach ${formatVariancePercent(l.bestSocial.momPct)} MoM` : "—",
        topAccount: l.topAccount ? `${l.topAccount.property} ${l.topAccount.accountName}: ${money(l.topAccount.revenue)}` : "—",
      },
    },
  };
}

export async function buildNarrativeContext(
  section: string,
  propertyCode: string,
  period: string,
): Promise<NarrativeContext | null> {
  if (propertyCode === "GROUP") return groupContext(period);

  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    select: { code: true, name: true, area: true, restaurantName: true, spaName: true },
  });
  if (!property) return null;

  const builder = RICH_BUILDERS[section];
  // Rich section: its own tailored context. Otherwise (plan / factor sections)
  // ground the draft in the executive KPI snapshot so figures stay real.
  const data = builder ? await builder(propertyCode, period) : { kpiSnapshot: await summaryContext(propertyCode, period) };

  return {
    section,
    property,
    period: periodLabel(period),
    data: data ?? { note: "No imported data for this section/period yet." },
  };
}
