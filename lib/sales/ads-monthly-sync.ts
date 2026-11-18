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
import { fetchAdsReport, isAdsSyncConfigured, type AdsFetchResult } from "@/lib/weekly/ads-sync";

const PERIOD_RE = /^\d{4}-\d{2}$/;

/** API platform name → AdsPlatform enum. */
const PLATFORM_ENUM: Record<string, "GOOGLE" | "META"> = { google: "GOOGLE", meta: "META" };

type AdsUnit = "HOTEL" | "RESTAURANT" | "SPA";

export interface MonthlyAdsSyncInput {
  property: string;
  period: string; // YYYY-MM
  /** Which business unit's ads to pull. HOTEL (default) queries the property
   * code; RESTAURANT/SPA query the outlet (see outletCodeFor). */
  unit?: AdsUnit;
  uploadedBy?: string | null;
}

export interface MonthlyAdsSyncResult {
  status: number;
  body:
    | {
        ok: true;
        property: string;
        period: string;
        unit: AdsUnit;
        /** The ads-dashboard "property" code actually queried (outlet for F&B/Spa). */
        outlet: string;
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

/**
 * The ads-dashboard "property" code to query for a given business unit. The ads
 * dashboard lists each outlet (restaurant/spa) as its own selectable property,
 * so the monthly sync queries it directly:
 *   HOTEL      → the property code (BKDS / BKDU / BKV)
 *   RESTAURANT → the restaurant outlet (BKeto / Botanist / Hiiragi)
 *   SPA        → the spa outlet (Mudara / Flying Bamboo / Heiwa)
 * Outlet names default to the property's restaurantName / spaName, but the ads
 * dashboard may label them slightly differently (e.g. "Bketo" vs "BKeto").
 * Override per property with ADS_RESTAURANT_CODES / ADS_SPA_CODES — a JSON map
 * keyed by property code, e.g. ADS_RESTAURANT_CODES='{"BKDS":"Bketo"}'.
 */
function outletCodeFor(
  unit: AdsUnit,
  property: { code: string; restaurantName: string; spaName: string },
): string {
  if (unit === "HOTEL") return property.code;
  const envName = unit === "RESTAURANT" ? "ADS_RESTAURANT_CODES" : "ADS_SPA_CODES";
  const fallback = unit === "RESTAURANT" ? property.restaurantName : property.spaName;
  try {
    const raw = process.env[envName];
    if (raw) {
      const map = JSON.parse(raw) as Record<string, unknown>;
      const v = map[property.code];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  } catch {
    // Malformed override JSON — fall back to the outlet name.
  }
  return fallback;
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
    const unit: AdsUnit = input.unit ?? "HOTEL";
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return fail(400, "period must be a real month in YYYY-MM form.");
    if (!isAdsSyncConfigured()) {
      return fail(503, "Ads sync is not configured — set ADS_API_KEY (and ADS_API_URL) on the server.");
    }

    const property = await prisma.property.findUnique({
      where: { code },
      select: { id: true, code: true, restaurantName: true, spaName: true },
    });
    if (!property) return fail(400, `unknown property "${code}".`);
    const outlet = outletCodeFor(unit, property);

    const existing = await prisma.reportPeriod.findUnique({
      where: { propertyId_period: { propertyId: property.id, period: date } },
      select: { id: true, status: true },
    });
    if (existing?.status === "FINAL") {
      return fail(409, "This report period is marked FINAL and is locked for editing.");
    }

    const periodStr = date.toISOString().slice(0, 7); // normalized (trimmed) YYYY-MM
    const window = monthWindow(periodStr);
    let fetched: AdsFetchResult;
    try {
      fetched = await fetchAdsReport(outlet, window); // throws on HTTP/auth errors
    } catch (e) {
      const msg = e instanceof Error ? e.message : "could not reach the ads API.";
      // Name the outlet code we queried — a 400 usually means this code isn't a
      // property the ads dashboard knows (e.g. "BKeto" vs the dashboard's "Bketo").
      // Set ADS_RESTAURANT_CODES / ADS_SPA_CODES to the exact code if so.
      return fail(502, `${msg} (requested ads outlet "${outlet}" for ${periodStr})`);
    }

    const rows = fetched.platforms
      .map((p) => ({ platform: PLATFORM_ENUM[p.platform], fig: p }))
      .filter((r): r is { platform: "GOOGLE" | "META"; fig: (typeof fetched.platforms)[number] } => !!r.platform)
      .map((r) => ({
        platform: r.platform,
        spend: r.fig.spend ?? 0,
        impressions: r.fig.impressions ?? 0,
        clicks: r.fig.clicks ?? 0,
        reach: r.fig.reach,
        // The ads API can report fractional conversions (daily/campaign rows are
        // Decimal(14,4)); round to a whole number for the Int column — matching
        // the ads dashboard's integer "conversions" headline.
        conversions: r.fig.conversions != null ? Math.round(r.fig.conversions) : null,
        trackedRevenue: r.fig.conversionValue ?? 0,
      }));

    if (rows.length === 0) {
      return fail(422, `The ads API returned no Google/Meta platform rows for "${outlet}" this month.`);
    }

    // Blended BOOKED revenue for the month — the headline ROAS basis (the ads
    // dashboard's "Revenue"/ROAS). Stored on each row so the read path recovers
    // it regardless of which platforms survive.
    const bookedRevenue = fetched.blended.revenue != null && fetched.blended.revenue >= 0 ? fetched.blended.revenue : null;

    const periodId = await prisma.$transaction(async (tx) => {
      const period = await tx.reportPeriod.upsert({
        where: { propertyId_period: { propertyId: property.id, period: date } },
        create: { propertyId: property.id, period: date, status: "DRAFT" },
        update: {},
        select: { id: true },
      });
      // Replace this period+unit's ads rows so a platform no longer returned by
      // the ads API doesn't linger and inflate spend/ROAS. Scoped to `unit` so a
      // RESTAURANT/SPA sync never disturbs the HOTEL rows (and vice-versa).
      await tx.adsPerformance.deleteMany({ where: { periodId: period.id, unit } });
      await tx.adsPerformance.createMany({
        data: rows.map((r) => ({
          periodId: period.id,
          unit,
          platform: r.platform,
          spend: r.spend,
          impressions: r.impressions,
          clicks: r.clicks,
          reach: r.reach,
          conversions: r.conversions,
          trackedRevenue: r.trackedRevenue,
          bookedRevenue,
        })),
      });
      await tx.importHistory.create({
        data: {
          propertyId: property.id,
          period: date,
          fileName: `Ads dashboard sync (${unit} · ${outlet} · ${window.from}→${window.to})`,
          uploadedBy: input.uploadedBy ?? null,
          rowCounts: { ADS: rows.length },
        },
      });
      return period.id;
    });

    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const convValue = rows.reduce((s, r) => s + r.trackedRevenue, 0);
    const trackedRevenue = bookedRevenue ?? convValue; // headline revenue basis
    const roasPct = spend > 0 ? (trackedRevenue / spend) * 100 : null;

    await logAudit("sales_ads_monthly_sync", code, {
      period: periodStr,
      unit,
      outlet,
      platforms: rows.length,
      spend,
      trackedRevenue,
      window,
    }).catch(() => {});

    const unitLabel = unit === "HOTEL" ? "Ads" : `${unit.charAt(0) + unit.slice(1).toLowerCase()} ads`;
    return {
      status: 200,
      body: {
        ok: true,
        property: code,
        period: periodStr,
        unit,
        outlet,
        periodId,
        platforms: rows.length,
        spend,
        trackedRevenue,
        roasPct,
        window: fetched.window,
        message: `${unitLabel} synced from "${outlet}" — ${rows.length} platform(s) for ${periodStr}${roasPct !== null ? ` · ROAS ${roasPct.toFixed(0)}%` : ""}.`,
      },
    };
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "ads sync failed.");
  }
}
