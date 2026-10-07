import { unstable_noStore as noStore } from "next/cache";

import { formatIDRCompact, formatNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { rate, sharePercent } from "@/lib/weekly/calculations";
import { adPlatformLabel, adsRevenueField } from "@/lib/weekly/ads";

/**
 * Weekly Ads / ROAS view model. Reads raw rows (blended / google / meta, daily
 * timeseries, campaigns) and computes ROAS, CTR and CPC — blended ROAS on
 * booked `revenue`, per-platform/campaign ROAS on attributed `conversionValue`.
 * Also builds a grounded, rule-based summary (headline / highlights / recs).
 */

const dec = (v: { toNumber(): number } | null): number | null => (v === null ? null : v.toNumber());

export interface WeeklyAdsRow {
  platform: string;
  label: string;
  spend: number | null;
  revenue: number | null;
  conversions: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  roas: number | null;
  ctr: number | null;
  cpc: number | null;
  source: string;
}

export interface WeeklyAdsDailyPoint {
  date: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  conversions: number | null;
  conversionValue: number | null;
}

export interface WeeklyAdsCampaignRow {
  campaignId: string;
  name: string;
  platformLabel: string;
  spend: number | null;
  conversions: number | null;
  revenue: number | null;
  impressions: number | null;
  clicks: number | null;
  roas: number | null;
  ctr: number | null;
  cpc: number | null;
}

export interface WeeklyAdsSummary {
  headline: string;
  highlights: string[];
  recommendations: string[];
}

export interface WeeklyAdsData {
  blended: WeeklyAdsRow | null;
  platforms: WeeklyAdsRow[];
  daily: WeeklyAdsDailyPoint[];
  campaigns: WeeklyAdsCampaignRow[];
  summary: WeeklyAdsSummary | null;
  window: { from: string | null; to: string | null };
  source: string | null;
  syncedAt: string | null;
  hasData: boolean;
}

const PLATFORM_ORDER: Record<string, number> = { blended: 0, google: 1, meta: 2 };
const CAMPAIGN_PLATFORM: Record<string, string> = { google: "Google", meta: "Meta" };

const money = (n: number | null) => (n == null ? "—" : formatIDRCompact(n));
const int = (n: number | null) => (n == null ? "—" : formatNumber(Math.round(n)));
const x = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);

/** A grounded headline / highlights / recommendations block from the figures. */
function buildSummary(blended: WeeklyAdsRow, platforms: WeeklyAdsRow[]): WeeklyAdsSummary {
  const g = platforms.find((p) => p.platform === "google") ?? null;
  const m = platforms.find((p) => p.platform === "meta") ?? null;
  const roasStr = blended.roas == null ? "—" : blended.roas.toFixed(2);

  const headline =
    `The ads earned ${money(blended.revenue)} in revenue from ${money(blended.spend)} of ad spend — a ROAS of ${x(blended.roas)}.` +
    (blended.roas == null ? "" : ` Every Rp 1 spent returned Rp ${roasStr} in revenue.`);

  const highlights: string[] = [
    `Revenue & ROAS — ${money(blended.revenue)} generated from ${money(blended.spend)} spend, a return of ${x(blended.roas)}.`,
  ];
  if (g) highlights.push(`Google — ${x(g.roas)} ROAS, ${int(g.clicks)} clicks and ${int(g.conversions)} conversions from ${money(g.spend)} spend.`);
  if (m) highlights.push(`Meta — ${money(m.spend)} spend, ${int(m.clicks)} clicks, ${int(m.conversions)} conversions, a ROAS of ${x(m.roas)}.`);
  highlights.push(`Engagement — CTR ${blended.ctr == null ? "—" : blended.ctr.toFixed(2) + "%"}, CPC ${money(blended.cpc)}.`);

  const recommendations: string[] = [];
  if (g && m && (g.roas ?? 0) > (m.roas ?? 0)) {
    recommendations.push("Shift a larger share of budget toward Google, where ROAS and conversions are strongest.");
  }
  if (m && (m.conversions ?? 0) === 0) {
    recommendations.push("Refresh Meta creative and targeting to unlock conversions and improve ROAS.");
  }
  recommendations.push("Monitor CPC and CTR; adjust bids or ad relevance to maintain efficient spend.");

  return { headline, highlights, recommendations };
}

/** Load the Ads/ROAS data for a property + week, with derived metrics + summary. */
export async function getWeeklyAds(propertyCode: string, week: string): Promise<WeeklyAdsData> {
  noStore();
  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    select: {
      adsRoas: true,
      adsDaily: { orderBy: { sortOrder: "asc" } },
      adsCampaigns: { orderBy: { sortOrder: "asc" } },
    },
  });

  const rows = report?.adsRoas ?? [];
  if (rows.length === 0) {
    return { blended: null, platforms: [], daily: [], campaigns: [], summary: null, window: { from: null, to: null }, source: null, syncedAt: null, hasData: false };
  }

  const toRow = (r: (typeof rows)[number]): WeeklyAdsRow => {
    const spend = dec(r.spend);
    const revenue = adsRevenueField(r.platform) === "revenue" ? dec(r.revenue) : dec(r.conversionValue);
    return {
      platform: r.platform,
      label: adPlatformLabel(r.platform),
      spend,
      revenue,
      conversions: dec(r.conversions),
      impressions: r.impressions,
      reach: r.reach,
      clicks: r.clicks,
      roas: rate(revenue, spend),
      ctr: sharePercent(r.clicks, r.impressions),
      cpc: rate(spend, r.clicks),
      source: r.source,
    };
  };

  const mapped = rows.map(toRow);
  const blended = mapped.find((r) => r.platform === "blended") ?? null;
  const platforms = mapped
    .filter((r) => r.platform !== "blended")
    .sort((a, b) => (PLATFORM_ORDER[a.platform] ?? 9) - (PLATFORM_ORDER[b.platform] ?? 9));

  const daily: WeeklyAdsDailyPoint[] = (report?.adsDaily ?? []).map((d) => ({
    date: d.date,
    spend: dec(d.spend),
    impressions: d.impressions,
    reach: d.reach,
    clicks: d.clicks,
    conversions: dec(d.conversions),
    conversionValue: dec(d.conversionValue),
  }));

  const campaigns: WeeklyAdsCampaignRow[] = (report?.adsCampaigns ?? []).map((c) => {
    const spend = dec(c.spend);
    const revenue = dec(c.conversionValue);
    return {
      campaignId: c.campaignId,
      name: c.campaignName,
      platformLabel: CAMPAIGN_PLATFORM[c.platform] ?? c.platform,
      spend,
      conversions: dec(c.conversions),
      revenue,
      impressions: c.impressions,
      clicks: c.clicks,
      roas: rate(revenue, spend),
      ctr: sharePercent(c.clicks, c.impressions),
      cpc: rate(spend, c.clicks),
    };
  });

  const sources = new Set(rows.map((r) => r.source));
  const source = sources.size > 1 ? "mixed" : (rows[0]?.source ?? null);
  const latest = rows.reduce<Date | null>((acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc), null);
  const win = rows.find((r) => r.windowFrom || r.windowTo);

  return {
    blended,
    platforms,
    daily,
    campaigns,
    summary: blended ? buildSummary(blended, platforms) : null,
    window: { from: win?.windowFrom ?? null, to: win?.windowTo ?? null },
    source,
    syncedAt: source === "manual" ? null : latest?.toISOString() ?? null,
    hasData: true,
  };
}
