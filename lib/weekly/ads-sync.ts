/**
 * Ads dashboard API client (Phase 11). Pulls the weekly ads/ROAS feed from the
 * Blue Karma ads dashboard and maps it to our per-platform shape. Runs
 * server-side only; the bearer token is read from ADS_API_KEY and never exposed.
 *
 * Endpoint: GET {ADS_API_URL}/api/v1/report?period=last-week&property=<code>
 *   - meta.from / meta.to : the 7-day window the figures cover
 *   - kpis                : blended totals (ROAS uses booked `revenue`)
 *   - platforms[]         : google / meta split (ROAS uses `conversionValue`)
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

export interface AdsPlatformFigures {
  platform: string;
  spend: number | null;
  conversionValue: number | null;
  conversions: number | null;
  impressions: number | null;
  clicks: number | null;
}

export interface AdsFetchResult {
  window: { from: string | null; to: string | null };
  /** The property the API actually scoped to ("all" means it did not filter). */
  scopedProperty: string | null;
  blended: {
    spend: number | null;
    revenue: number | null;
    conversionValue: number | null;
    conversions: number | null;
    impressions: number | null;
    clicks: number | null;
  };
  platforms: AdsPlatformFigures[];
}

interface ReportJson {
  meta?: { from?: string; to?: string; property?: string };
  kpis?: Record<string, unknown>;
  platforms?: Record<string, unknown>[];
}

/** Fetch + map the last-week ads report for one property. Throws on HTTP / auth errors. */
export async function fetchAdsReport(propertyCode: string): Promise<AdsFetchResult> {
  const key = process.env.ADS_API_KEY;
  if (!key) throw new Error("ADS_API_KEY is not set on the server.");

  const url = `${adsApiBase()}/api/v1/report?period=last-week&property=${encodeURIComponent(propertyCode)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    });
  } catch (err) {
    throw new Error(`Could not reach the ads API: ${err instanceof Error ? err.message : "network error"}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new Error("The ads API rejected the key (401/403) — check ADS_API_KEY.");
  }
  if (!res.ok) {
    throw new Error(`The ads API returned HTTP ${res.status}.`);
  }

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
      spend: n(p.spend),
      conversionValue: n(p.conversionValue),
      conversions: n(p.conversions),
      impressions: n(p.impressions),
      clicks: n(p.clicks),
    }))
    .filter((p) => p.platform === "google" || p.platform === "meta");

  return {
    window: { from: json.meta?.from ?? null, to: json.meta?.to ?? null },
    scopedProperty: json.meta?.property ?? null,
    blended: {
      spend: n(k.spend),
      revenue: n(k.revenue),
      conversionValue: n(k.conversionValue),
      conversions: n(k.conversions),
      impressions: n(k.impressions),
      clicks: n(k.clicks),
    },
    platforms,
  };
}

/**
 * Fetch the ads report for a property and upsert blended + per-platform rows
 * into one weekly report (single fetch). No auth — callers gate access. Returns
 * the number of rows written and the window covered.
 */
export async function syncAdsIntoReport(
  reportId: string,
  propertyCode: string,
): Promise<{ rows: number; window: { from: string | null; to: string | null } }> {
  const fetched = await fetchAdsReport(propertyCode);
  const { window, blended, platforms } = fetched;

  const writes = [
    prisma.weeklyAdsRoas.upsert({
      where: { reportWeekId_platform: { reportWeekId: reportId, platform: "blended" } },
      update: {
        spend: blended.spend, revenue: blended.revenue, conversionValue: blended.conversionValue,
        conversions: blended.conversions, impressions: blended.impressions, clicks: blended.clicks,
        source: "api", windowFrom: window.from, windowTo: window.to, sortOrder: 0,
      },
      create: {
        reportWeekId: reportId, platform: "blended",
        spend: blended.spend, revenue: blended.revenue, conversionValue: blended.conversionValue,
        conversions: blended.conversions, impressions: blended.impressions, clicks: blended.clicks,
        source: "api", windowFrom: window.from, windowTo: window.to, sortOrder: 0,
      },
    }),
    ...platforms.map((p, i) =>
      prisma.weeklyAdsRoas.upsert({
        where: { reportWeekId_platform: { reportWeekId: reportId, platform: p.platform } },
        update: {
          spend: p.spend, revenue: null, conversionValue: p.conversionValue,
          conversions: p.conversions, impressions: p.impressions, clicks: p.clicks,
          source: "api", windowFrom: window.from, windowTo: window.to, sortOrder: i + 1,
        },
        create: {
          reportWeekId: reportId, platform: p.platform,
          spend: p.spend, revenue: null, conversionValue: p.conversionValue,
          conversions: p.conversions, impressions: p.impressions, clicks: p.clicks,
          source: "api", windowFrom: window.from, windowTo: window.to, sortOrder: i + 1,
        },
      }),
    ),
  ];
  await prisma.$transaction(writes);
  return { rows: writes.length, window };
}
