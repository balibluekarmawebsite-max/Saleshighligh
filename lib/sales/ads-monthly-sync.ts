/**
 * Monthly Digital Ads & ROAS sync for the Sales Highlight. Reuses the same ads
 * dashboard API client as the WEEKLY report (lib/weekly/ads-sync.ts), but pulls
 * the whole report MONTH and writes the monthly `AdsPerformance` rows (unit
 * HOTEL, platform GOOGLE/META) the Marketing page already reads. Same data,
 * monthly window.
 *
 * ROAS note: per-platform tracked revenue uses the API's `conversionValue`
 * (matching the weekly per-platform ROAS); blended `revenue` is booked revenue
 * and isn't split per platform, so it isn't stored here.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { fetchAdsReport, isAdsSyncConfigured } from "@/lib/weekly/ads-sync";

const PERIOD_RE = /^\d{4}-\d{2}$/;

/** API platform name → AdsPlatform enum. */
const PLATFORM_ENUM: Record<string, "GOOGLE" | "META"> = { google: "GOOGLE", meta: "META" };

export interface MonthlyAdsSyncInput {
  property: string;
  period: string; // YYYY-MM
  uploadedBy?: string | null;
}

export interface MonthlyAdsSyncResult {
  status: number;
  body:
    | {
        ok: true;
        property: string;
        period: string;
        periodId: string;
        platforms: number;
        spend: number;
        trackedRevenue: number;
        roasPct: number | null;
        window: { from: string | null; to: string | null };
        message: string;
      }
    | { ok: false; error: string };
}

const fail = (status: number, error: string): MonthlyAdsSyncResult => ({ status, body: { ok: false, error } });

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

/** First + last calendar day of a YYYY-MM, as YYYY-MM-DD (UTC). */
function monthWindow(period: string): { from: string; to: string } {
  const [y, m] = period.split("-").map(Number);
  const from = `${period}-01`;
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate(); // day 0 of next month = last day
  const to = `${period}-${String(last).padStart(2, "0")}`;
  return { from, to };
}

export async function runMonthlyAdsSync(input: MonthlyAdsSyncInput): Promise<MonthlyAdsSyncResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return fail(400, "property is required.");
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return fail(400, "period must be a real month in YYYY-MM form.");
    if (!isAdsSyncConfigured()) {
      return fail(503, "Ads sync is not configured — set ADS_API_KEY (and ADS_API_URL) on the server.");
    }

    const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
    if (!property) return fail(400, `unknown property "${code}".`);

    const existing = await prisma.reportPeriod.findUnique({
      where: { propertyId_period: { propertyId: property.id, period: date } },
      select: { id: true, status: true },
    });
    if (existing?.status === "FINAL") {
      return fail(409, "This report period is marked FINAL and is locked for editing.");
    }

    const periodStr = date.toISOString().slice(0, 7); // normalized (trimmed) YYYY-MM
    const window = monthWindow(periodStr);
    const fetched = await fetchAdsReport(code, window); // throws on HTTP/auth errors

    const rows = fetched.platforms
      .map((p) => ({ platform: PLATFORM_ENUM[p.platform], fig: p }))
      .filter((r): r is { platform: "GOOGLE" | "META"; fig: (typeof fetched.platforms)[number] } => !!r.platform)
      .map((r) => ({
        platform: r.platform,
        spend: r.fig.spend ?? 0,
        impressions: r.fig.impressions ?? 0,
        clicks: r.fig.clicks ?? 0,
        reach: r.fig.reach,
        trackedRevenue: r.fig.conversionValue ?? 0,
      }));

    if (rows.length === 0) {
      return fail(422, "The ads API returned no Google/Meta platform rows for this month.");
    }

    const periodId = await prisma.$transaction(async (tx) => {
      const period = await tx.reportPeriod.upsert({
        where: { propertyId_period: { propertyId: property.id, period: date } },
        create: { propertyId: property.id, period: date, status: "DRAFT" },
        update: {},
        select: { id: true },
      });
      // Replace the period's HOTEL ads rows so a platform no longer returned by
      // the ads API doesn't linger and inflate spend/ROAS.
      await tx.adsPerformance.deleteMany({ where: { periodId: period.id, unit: "HOTEL" } });
      await tx.adsPerformance.createMany({
        data: rows.map((r) => ({
          periodId: period.id,
          unit: "HOTEL" as const,
          platform: r.platform,
          spend: r.spend,
          impressions: r.impressions,
          clicks: r.clicks,
          reach: r.reach,
          trackedRevenue: r.trackedRevenue,
        })),
      });
      await tx.importHistory.create({
        data: {
          propertyId: property.id,
          period: date,
          fileName: `Ads dashboard sync (${window.from}→${window.to})`,
          uploadedBy: input.uploadedBy ?? null,
          rowCounts: { ADS: rows.length },
        },
      });
      return period.id;
    });

    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const trackedRevenue = rows.reduce((s, r) => s + r.trackedRevenue, 0);
    const roasPct = spend > 0 ? (trackedRevenue / spend) * 100 : null;

    await logAudit("sales_ads_monthly_sync", code, {
      period: periodStr,
      platforms: rows.length,
      spend,
      trackedRevenue,
      window,
    }).catch(() => {});

    return {
      status: 200,
      body: {
        ok: true,
        property: code,
        period: periodStr,
        periodId,
        platforms: rows.length,
        spend,
        trackedRevenue,
        roasPct,
        window: fetched.window,
        message: `Ads synced — ${rows.length} platform(s) for ${periodStr}${roasPct !== null ? ` · ROAS ${roasPct.toFixed(0)}%` : ""}.`,
      },
    };
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "ads sync failed.");
  }
}
