/**
 * Ads dashboard API client (Phase 11/12). Pulls the weekly ads/ROAS feed from
 * the Blue Karma ads dashboard and maps it to our shape. Server-side only; the
 * bearer token is read from ADS_API_KEY and never exposed.
 *
 * Endpoint: GET {ADS_API_URL}/api/v1/report?property=<code>&(from&to | period)
 *   - meta.from / meta.to : the window the figures cover (we pass the report's
 *     own week dates so the ads range matches the weekly report)
 *   - kpis        : blended totals (ROAS uses booked `revenue`)
 *   - platforms[] : google / meta split (ROAS uses `conversionValue`)
 *   - timeseries[]: per-day metrics (sparklines + trend chart)
 *   - campaigns[] : per-campaign breakdown
 */

import { prisma } from "@/lib/prisma";

const DEFAULT_BASE = "https://ads.bluekarmasecrets.com";

export function adsApiBase(): string {
  return (process.env.ADS_API_URL ?? DEFAULT_BASE).replace(/\/+$/, "");
}

export function isAdsSyncConfigured(): boolean {
  return !!process.env.ADS_API_KEY;
}

const n = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const ri = (v: unknown): number | null => {
  const x = n(v);
  return x === null ? null : Math.round(x);
};

export interface AdsPlatformFigures {
  platform: string;
  spend: number | null;
  conversionValue: number | null;
  conversions: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
}

export interface AdsDailyFigures {
  date: string;
  spend: number | null;
  conversionValue: number | null;
  conversions: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
}

export interface AdsCampaignFigures {
  campaignId: string;
  campaignName: string;
  platform: string;
  spend: number | null;
  conversionValue: number | null;
  conversions: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
}

export interface AdsFetchResult {
  window: { from: string | null; to: string | null };
  scopedProperty: string | null;
  blended: {
    spend: number | null;
    revenue: number | null;
    conversionValue: number | null;
    conversions: number | null;
    impressions: number | null;
    reach: number | null;
    clicks: number | null;
  };
  platforms: AdsPlatformFigures[];
  daily: AdsDailyFigures[];
  campaigns: AdsCampaignFigures[];
}

interface ReportJson {
  meta?: { from?: string; to?: string; property?: string };
  kpis?: Record<string, unknown>;
  platforms?: Record<string, unknown>[];
  timeseries?: Record<string, unknown>[];
  campaigns?: Record<string, unknown>[];
}

/** Fetch + map the ads report for one property over a window. Throws on HTTP/auth errors. */
export async function fetchAdsReport(
  propertyCode: string,
  opts?: { from?: string | null; to?: string | null },
): Promise<AdsFetchResult> {
  const key = process.env.ADS_API_KEY;
  if (!key) throw new Error("ADS_API_KEY is not set on the server.");

  const params = new URLSearchParams({ property: propertyCode });
  if (opts?.from && opts?.to) {
    params.set("from", opts.from);
    params.set("to", opts.to);
  } else {
    params.set("period", "last-week");
  }
  const url = `${adsApiBase()}/api/v1/report?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(`Could not reach the ads API: ${err instanceof Error ? err.message : "network error"}`);
  }
  if (res.status === 401 || res.status === 403) throw new Error("The ads API rejected the key (401/403) — check ADS_API_KEY.");
  if (!res.ok) throw new Error(`The ads API returned HTTP ${res.status}.`);

  let json: ReportJson;
  try {
    json = (await res.json()) as ReportJson;
  } catch {
    throw new Error("The ads API returned a non-JSON response.");
  }

  const k = json.kpis ?? {};
  const platforms: AdsPlatformFigures[] = (json.platforms ?? [])
    .map((p) => ({
      platform: String(p.platform ?? "").toLowerCase(),
      spend: n(p.spend), conversionValue: n(p.conversionValue), conversions: n(p.conversions),
      impressions: ri(p.impressions), reach: ri(p.reach), clicks: ri(p.clicks),
    }))
    .filter((p) => p.platform === "google" || p.platform === "meta");

  const daily: AdsDailyFigures[] = (json.timeseries ?? []).map((d) => ({
    date: String(d.date ?? ""),
    spend: n(d.spend), conversionValue: n(d.conversionValue), conversions: n(d.conversions),
    impressions: ri(d.impressions), reach: ri(d.reach), clicks: ri(d.clicks),
  })).filter((d) => d.date);

  const campaigns: AdsCampaignFigures[] = (json.campaigns ?? []).map((c) => ({
    campaignId: String(c.campaignId ?? ""),
    campaignName: String(c.campaignName ?? "(unnamed)"),
    platform: String(c.platform ?? "").toLowerCase(),
    spend: n(c.spend), conversionValue: n(c.conversionValue), conversions: n(c.conversions),
    impressions: ri(c.impressions), reach: ri(c.reach), clicks: ri(c.clicks),
  })).filter((c) => c.campaignId);

  return {
    window: { from: json.meta?.from ?? opts?.from ?? null, to: json.meta?.to ?? opts?.to ?? null },
    scopedProperty: json.meta?.property ?? null,
    blended: {
      spend: n(k.spend), revenue: n(k.revenue), conversionValue: n(k.conversionValue),
      conversions: n(k.conversions), impressions: ri(k.impressions), reach: ri(k.reach), clicks: ri(k.clicks),
    },
    platforms, daily, campaigns,
  };
}

/**
 * Fetch the ads report for a weekly report and upsert blended + per-platform
 * rows, plus replace-all daily and campaign rows (single fetch, over the
 * report's own Fri–Thu week). No auth — callers gate access.
 */
export async function syncAdsIntoReport(
  reportId: string,
  propertyCode: string,
): Promise<{ rows: number; window: { from: string | null; to: string | null } }> {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: { startDate: true, endDate: true },
  });
  const from = report?.startDate.toISOString().slice(0, 10) ?? null;
  const to = report?.endDate.toISOString().slice(0, 10) ?? null;

  const fetched = await fetchAdsReport(propertyCode, { from, to });
  const { window, blended, platforms, daily, campaigns } = fetched;

  const summaryRow = (platform: string, spend: number | null, revenue: number | null, conversionValue: number | null, conversions: number | null, impressions: number | null, reach: number | null, clicks: number | null, sortOrder: number) => ({
    where: { reportWeekId_platform: { reportWeekId: reportId, platform } },
    update: { spend, revenue, conversionValue, conversions, impressions, reach, clicks, source: "api", windowFrom: window.from, windowTo: window.to, sortOrder },
    create: { reportWeekId: reportId, platform, spend, revenue, conversionValue, conversions, impressions, reach, clicks, source: "api", windowFrom: window.from, windowTo: window.to, sortOrder },
  });

  await prisma.$transaction([
    prisma.weeklyAdsRoas.upsert(summaryRow("blended", blended.spend, blended.revenue, blended.conversionValue, blended.conversions, blended.impressions, blended.reach, blended.clicks, 0)),
    ...platforms.map((p, i) => prisma.weeklyAdsRoas.upsert(summaryRow(p.platform, p.spend, null, p.conversionValue, p.conversions, p.impressions, p.reach, p.clicks, i + 1))),
    prisma.weeklyAdsDaily.deleteMany({ where: { reportWeekId: reportId } }),
    prisma.weeklyAdsDaily.createMany({
      data: daily.map((d, i) => ({ reportWeekId: reportId, date: d.date, spend: d.spend, conversionValue: d.conversionValue, conversions: d.conversions, impressions: d.impressions, reach: d.reach, clicks: d.clicks, sortOrder: i })),
    }),
    prisma.weeklyAdsCampaign.deleteMany({ where: { reportWeekId: reportId } }),
    prisma.weeklyAdsCampaign.createMany({
      data: campaigns.map((c, i) => ({ reportWeekId: reportId, campaignId: c.campaignId, campaignName: c.campaignName, platform: c.platform, spend: c.spend, conversionValue: c.conversionValue, conversions: c.conversions, impressions: c.impressions, reach: c.reach, clicks: c.clicks, sortOrder: i })),
    }),
  ]);

  return { rows: 1 + platforms.length, window };
}
