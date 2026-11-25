/**
 * Monthly Social Media sync from Metricool for the Sales Highlight. Pulls one
 * business unit's Metricool brand across Instagram / Facebook / TikTok / YouTube
 * for the whole report month and writes the monthly `SocialMediaMetrics` rows the
 * Social page already reads (keyed [periodId, unit, platform]).
 *
 * Brand model: HOTEL uses the property's shared Metricool brand (the same
 * `blogId` the weekly report uses); RESTAURANT/SPA use their own `blogId:UNIT`
 * override and are skipped when unassigned (never duplicated from the hotel).
 *
 * Safety: a platform is only written when at least one of its six metrics
 * resolved, and each platform is UPSERTed updating ONLY the columns that actually
 * came back — so a metric Metricool returns empty (several IG/FB metrics commonly
 * are) keeps its previously-stored or manually-imported value instead of being
 * zeroed. A failed/empty pull touches nothing. A FINAL period is refused.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  buildSocialRow,
  SOCIAL_NETWORKS,
  type BuiltSocialRow,
  type SocialPlatformEnum,
  type SocialRow,
} from "@/lib/sales/social-monthly-logic";
import { fetchNetworkMonth, monthBounds, type SocialMetricFetch } from "@/lib/sales/social-metricool";
import { getUnitBlogId, isMetricoolConfigured, listMetricoolBrands } from "@/lib/weekly/metricool";

export type SocialUnit = "HOTEL" | "RESTAURANT" | "SPA";
const UNITS: SocialUnit[] = ["HOTEL", "RESTAURANT", "SPA"];

export interface SocialNetworkDiag {
  platform: string;
  enumValue: SocialPlatformEnum;
  wrote: boolean;
  metrics: SocialMetricFetch[];
}

export interface SocialMonthlySyncResult {
  status: number;
  body:
    | {
        ok: true;
        property: string;
        period: string;
        unit: SocialUnit;
        blogId: string;
        brandLabel: string | null;
        periodId: string;
        platformsWritten: number;
        rows: number;
        window: { from: string; to: string };
        networks: SocialNetworkDiag[];
        syncedAt: string;
        message: string;
      }
    | { ok: false; error: string };
}

export interface SocialMonthlySyncInput {
  property: string;
  period: string; // YYYY-MM
  unit?: SocialUnit;
  uploadedBy?: string | null;
}

const PERIOD_RE = /^\d{4}-\d{2}$/;
const fail = (status: number, error: string): SocialMonthlySyncResult => ({ status, body: { ok: false, error } });

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

const ymd = (d: Date): string => d.toISOString().slice(0, 10);

const UNIT_LABEL: Record<SocialUnit, string> = { HOTEL: "Hotel", RESTAURANT: "Restaurant", SPA: "Spa" };

export async function runMonthlySocialSync(input: SocialMonthlySyncInput): Promise<SocialMonthlySyncResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return fail(400, "property is required.");
    const unit: SocialUnit = input.unit && UNITS.includes(input.unit) ? input.unit : "HOTEL";
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return fail(400, "period must be a real month in YYYY-MM form.");
    const periodStr = date.toISOString().slice(0, 7);
    if (!isMetricoolConfigured()) {
      return fail(503, "Metricool isn't configured — set METRICOOL_USER_TOKEN / METRICOOL_USER_ID on the server.");
    }

    const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
    if (!property) return fail(400, `unknown property "${code}".`);

    const blogId = await getUnitBlogId(code, unit);
    if (!blogId) {
      const where =
        unit === "HOTEL"
          ? "Settings → Social Media (the property brand)"
          : `the Social page's ${UNIT_LABEL[unit]} brand field`;
      return fail(
        422,
        `No Metricool brand assigned for ${UNIT_LABEL[unit]} — assign one in ${where} before syncing.`,
      );
    }

    const existing = await prisma.reportPeriod.findUnique({
      where: { propertyId_period: { propertyId: property.id, period: date } },
      select: { id: true, status: true },
    });
    if (existing?.status === "FINAL") {
      return fail(409, "This report period is marked FINAL and is locked for editing.");
    }

    const bounds = monthBounds(periodStr);
    if (!bounds) return fail(400, "period must be a real month in YYYY-MM form.");
    const window = { from: ymd(bounds.from), to: ymd(bounds.to) };

    // Resolve the brand's human label for the diagnostic (non-fatal).
    const brandLabel = await listMetricoolBrands()
      .then((brands) => brands.find((b) => b.blogId === blogId)?.label ?? null)
      .catch(() => null);

    // Pull all four networks for the month, concurrently.
    const networks: SocialNetworkDiag[] = await Promise.all(
      SOCIAL_NETWORKS.map(async (net): Promise<SocialNetworkDiag> => {
        const fetched = await fetchNetworkMonth(blogId, net.apiName, periodStr).catch(() => null);
        const metrics = fetched?.metrics ?? [];
        const wrote = metrics.some((m) => m.value !== null);
        return { platform: net.platform, enumValue: net.enumValue, wrote, metrics };
      }),
    );

    // Build the rows for platforms that resolved at least one metric.
    const toWrite: { platform: SocialPlatformEnum; built: BuiltSocialRow }[] = [];
    for (const net of networks) {
      const values = Object.fromEntries(net.metrics.map((m) => [m.key, m.value]));
      const built = buildSocialRow(values);
      if (built) toWrite.push({ platform: net.enumValue, built });
    }

    if (toWrite.length === 0) {
      return fail(
        422,
        `Connected to "${brandLabel ?? blogId}", but no social metrics resolved for ${periodStr}. Check that this brand's accounts are connected in Metricool (and, for TikTok/YouTube, pin the metric names via METRICOOL_SOCIAL_METRIC_MAP).`,
      );
    }

    const writtenPlatforms = toWrite.map((w) => w.platform);
    const periodId = await prisma.$transaction(async (tx) => {
      const period = await tx.reportPeriod.upsert({
        where: { propertyId_period: { propertyId: property.id, period: date } },
        create: { propertyId: property.id, period: date, status: "DRAFT" },
        update: {},
        select: { id: true },
      });
      // Upsert each resolved platform, UPDATING ONLY the columns that actually
      // came back this pull — so a metric Metricool returned empty (common for
      // several IG/FB metrics) keeps its previously-stored or manually-imported
      // value instead of being overwritten with 0. On CREATE there is no prior
      // value, so unresolved columns default to 0.
      for (const w of toWrite) {
        const update: Partial<SocialRow> = {};
        for (const key of w.built.resolvedKeys) update[key] = w.built.row[key];
        await tx.socialMediaMetrics.upsert({
          where: { periodId_unit_platform: { periodId: period.id, unit, platform: w.platform } },
          create: {
            periodId: period.id,
            unit,
            platform: w.platform,
            impressions: w.built.row.impressions,
            reach: w.built.row.reach,
            interactions: w.built.row.interactions,
            linkClicks: w.built.row.linkClicks,
            profileVisits: w.built.row.profileVisits,
            followersGained: w.built.row.followersGained,
          },
          update,
        });
      }
      await tx.importHistory.create({
        data: {
          propertyId: property.id,
          period: date,
          fileName: `Metricool social sync (${UNIT_LABEL[unit]} · brand ${blogId} · ${window.from}→${window.to})`,
          uploadedBy: input.uploadedBy ?? null,
          rowCounts: { SOCIAL: toWrite.length },
        },
      });
      return period.id;
    });

    const syncedAt = new Date().toISOString();
    await logAudit("sales_social_monthly_sync", `${code} ${periodStr}`, {
      unit,
      blogId,
      platforms: writtenPlatforms,
      window,
    }).catch(() => {});

    const names = toWrite.map((w) => SOCIAL_NETWORKS.find((n) => n.enumValue === w.platform)?.platform ?? w.platform);
    return {
      status: 200,
      body: {
        ok: true,
        property: code,
        period: periodStr,
        unit,
        blogId,
        brandLabel,
        periodId,
        platformsWritten: toWrite.length,
        rows: toWrite.length,
        window,
        networks,
        syncedAt,
        message: `${UNIT_LABEL[unit]} social synced from "${brandLabel ?? blogId}" — ${names.join(", ")} for ${periodStr}.`,
      },
    };
  } catch (e) {
    return fail(502, e instanceof Error ? e.message : "social sync failed.");
  }
}
