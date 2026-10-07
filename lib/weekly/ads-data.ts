import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";
import { rate, sharePercent } from "@/lib/weekly/calculations";
import { adPlatformLabel, adsRevenueField } from "@/lib/weekly/ads";

/**
 * Weekly Ads / ROAS view model. Reads raw rows (blended / google / meta) and
 * computes ROAS, CTR and CPC — blended ROAS on booked `revenue`, per-platform
 * ROAS on attributed `conversionValue` (whichever `adsRevenueField` selects).
 */

const dec = (v: { toNumber(): number } | null): number | null => (v === null ? null : v.toNumber());

export interface WeeklyAdsRow {
  platform: string;
  label: string;
  spend: number | null;
  /** Effective revenue for this row: booked (blended) or attributed (platforms). */
  revenue: number | null;
  conversions: number | null;
  impressions: number | null;
  clicks: number | null;
  roas: number | null; // revenue / spend
  ctr: number | null; // percent
  cpc: number | null; // spend / clicks
  source: string;
}

export interface WeeklyAdsData {
  blended: WeeklyAdsRow | null;
  platforms: WeeklyAdsRow[];
  window: { from: string | null; to: string | null };
  source: string | null; // "api" | "manual" | "mixed"
  syncedAt: string | null;
  hasData: boolean;
}

const PLATFORM_ORDER: Record<string, number> = { blended: 0, google: 1, meta: 2 };

/** Load the Ads/ROAS data for a property + week, with derived ROAS/CTR/CPC. */
export async function getWeeklyAds(propertyCode: string, week: string): Promise<WeeklyAdsData> {
  noStore();
  const rows = await prisma.weeklyAdsRoas.findMany({
    where: {
      reportWeek: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    },
  });

  if (rows.length === 0) {
    return { blended: null, platforms: [], window: { from: null, to: null }, source: null, syncedAt: null, hasData: false };
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

  const sources = new Set(rows.map((r) => r.source));
  const source = sources.size > 1 ? "mixed" : (rows[0]?.source ?? null);
  const latest = rows.reduce<Date | null>((acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc), null);
  const win = rows.find((r) => r.windowFrom || r.windowTo);

  return {
    blended,
    platforms,
    window: { from: win?.windowFrom ?? null, to: win?.windowTo ?? null },
    source,
    syncedAt: source === "manual" ? null : latest?.toISOString() ?? null,
    hasData: true,
  };
}
