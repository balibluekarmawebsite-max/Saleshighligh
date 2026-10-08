/**
 * Metricool → Section H sync. Pulls Instagram + Facebook metrics for a report's
 * reporting week (this week) and the previous week (last week) and writes them
 * into WeeklySocialMetric, so growth is computed from real data.
 *
 * Window: the report's own startDate..endDate is "this week"; the same window
 * shifted back 7 days is "last week". For each network we try every candidate
 * metric name (see metricool.ts) and keep the one that returns a value.
 *
 * Safety: a platform is only rewritten when at least one of its metrics
 * resolved a value — a failed/empty pull never wipes manually-entered rows.
 */

import { prisma } from "@/lib/prisma";
import { SOCIAL_METRIC_ROWS } from "@/lib/weekly/editor-data";
import {
  METRICOOL_NETWORKS,
  fetchMetricByName,
  fetchMetricValue,
  getPropertyBlogId,
  listMetricoolBrands,
  metricKind,
  toYmd,
} from "@/lib/weekly/metricool";

export interface MetricoolMetricResult {
  key: string;
  label: string;
  metric: string | null;
  thisWeek: number | null;
  lastWeek: number | null;
  tried: string[];
}

export interface MetricoolNetworkResult {
  platform: string;
  wrote: boolean;
  metrics: MetricoolMetricResult[];
}

export interface MetricoolSyncResult {
  blogId: string;
  brandLabel: string | null;
  window: {
    thisWeek: { from: string; to: string };
    lastWeek: { from: string; to: string };
  };
  networks: MetricoolNetworkResult[];
  rows: number;
  syncedAt: string;
}

/** The Section H rows Metricool can fill, in the editor's display order. */
const SYNC_ROWS = SOCIAL_METRIC_ROWS.filter((r) =>
  ["account_reached", "impression", "profile_visit", "website_visit", "followers"].includes(r.key),
);

const round = (v: number | null): number | null => (v === null ? null : Math.round(v));
const ymdDash = (d: Date): string => d.toISOString().slice(0, 10);
const shift = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);

/**
 * Sync one report's Section H Instagram + Facebook metrics from Metricool.
 * Throws only when the property has no brand assigned or the account is
 * unreachable; a missing individual metric is reported, not thrown.
 */
export async function syncMetricoolIntoReport(
  reportId: string,
  propertyCode: string,
): Promise<MetricoolSyncResult> {
  const report = await prisma.weeklyReport.findUnique({
    where: { id: reportId },
    select: { startDate: true, endDate: true },
  });
  if (!report) throw new Error("Report not found.");

  const blogId = await getPropertyBlogId(propertyCode);
  if (!blogId) {
    throw new Error("No Metricool brand assigned to this property — set one in Settings → Social Media.");
  }

  // Resolve the brand's human label (for the preview + Excel note); non-fatal.
  const brandLabel = await listMetricoolBrands()
    .then((brands) => brands.find((b) => b.blogId === blogId)?.label ?? null)
    .catch(() => null);

  const thisFrom = report.startDate;
  const thisTo = report.endDate;
  const lastFrom = shift(thisFrom, -7);
  const lastTo = shift(thisTo, -7);

  const window = {
    thisWeek: { from: ymdDash(thisFrom), to: ymdDash(thisTo) },
    lastWeek: { from: ymdDash(lastFrom), to: ymdDash(lastTo) },
  };

  interface SocialMetricRow {
    reportWeekId: string;
    platform: string;
    metricKey: string;
    lastWeek: number | null;
    thisWeek: number | null;
    sortOrder: number;
  }
  const tFrom = toYmd(thisFrom);
  const tTo = toYmd(thisTo);
  const lFrom = toYmd(lastFrom);
  const lTo = toYmd(lastTo);

  // Fetch every (network × metric) concurrently. Within a metric, probe the
  // candidate names for THIS week, then pin LAST week to the exact name that
  // resolved — so growth always compares the same underlying metric.
  const networks: MetricoolNetworkResult[] = await Promise.all(
    METRICOOL_NETWORKS.map(async (net) => {
      const metrics: MetricoolMetricResult[] = await Promise.all(
        SYNC_ROWS.map(async (row): Promise<MetricoolMetricResult> => {
          const now = await fetchMetricValue(blogId, net.platform, net.prefix, row.key, tFrom, tTo);
          let lastWeek: number | null;
          let metric = now.metric;
          let tried = now.tried;
          if (now.metric) {
            // Pin last week to the same metric name (no re-probing).
            lastWeek = await fetchMetricByName(blogId, now.metric, metricKind(row.key), lFrom, lTo);
          } else {
            // Nothing this week — still try last week so its value isn't lost.
            const prev = await fetchMetricValue(blogId, net.platform, net.prefix, row.key, lFrom, lTo);
            lastWeek = prev.value;
            metric = prev.metric;
            tried = prev.tried;
          }
          return {
            key: row.key,
            label: row.label,
            metric,
            thisWeek: round(now.value),
            lastWeek: round(lastWeek),
            tried,
          };
        }),
      );
      return { platform: net.platform, wrote: metrics.some((m) => m.thisWeek !== null || m.lastWeek !== null), metrics };
    }),
  );

  // Write resolved metrics per network. The delete is scoped to the metric keys
  // we actually resolved, so a metric that didn't come back (e.g. a manually
  // entered one Metricool doesn't serve) keeps its existing value.
  const writes: { platform: string; keys: string[]; data: SocialMetricRow[] }[] = [];
  for (const net of networks) {
    const resolved = net.metrics.filter((m) => m.thisWeek !== null || m.lastWeek !== null);
    if (!resolved.length) continue;
    writes.push({
      platform: net.platform,
      keys: resolved.map((m) => m.key),
      data: resolved.map((m) => ({
        reportWeekId: reportId,
        platform: net.platform,
        metricKey: m.key,
        lastWeek: m.lastWeek,
        thisWeek: m.thisWeek,
        sortOrder: SYNC_ROWS.findIndex((r) => r.key === m.key),
      })),
    });
  }

  const rows = writes.reduce((n, w) => n + w.data.length, 0);
  const syncedAt = new Date().toISOString();

  if (writes.length) {
    await prisma.$transaction([
      ...writes.map((w) =>
        prisma.weeklySocialMetric.deleteMany({
          where: { reportWeekId: reportId, platform: w.platform, metricKey: { in: w.keys } },
        }),
      ),
      ...writes.map((w) => prisma.weeklySocialMetric.createMany({ data: w.data })),
    ]);
  }

  return { blogId, brandLabel, window, networks, rows, syncedAt };
}
