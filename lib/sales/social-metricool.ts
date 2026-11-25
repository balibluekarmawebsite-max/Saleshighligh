/**
 * Metricool fetch wrapper for the MONTHLY Social Media section. Pulls one
 * business unit's brand (blogId) across Instagram / Facebook / TikTok / YouTube
 * for a whole report month and reduces each of the six metrics (see
 * social-monthly-logic.ts). Thin I/O layer over metricool.ts — the name
 * resolution and reduction live in the pure logic module.
 *
 * All six metrics come from the v2 /analytics/timelines endpoint (subject=
 * account): flow metrics sum the month's days, followersGained is the last−first
 * delta of the daily follower/subscriber count. A metric that doesn't resolve
 * (unknown name, network not connected to the brand) is simply left blank.
 */

import {
  metricoolV2Timeline,
  metricoolTimezone,
  toTzIso,
} from "@/lib/weekly/metricool";
import {
  reduceMonthly,
  resolveSocialMetricNames,
  parseSocialMetricMap,
  SOCIAL_METRIC_KIND,
  SOCIAL_MONTHLY_METRICS,
  type SocialMonthlyMetric,
} from "@/lib/sales/social-monthly-logic";

/** One metric's resolved value for a network, plus the name used + names tried. */
export interface SocialMetricFetch {
  key: SocialMonthlyMetric;
  value: number | null;
  usedName: string | null;
  tried: string[];
}

/** First + last calendar day of a YYYY-MM as Date (UTC midnight). */
export function monthBounds(period: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}$/.test(period)) return null;
  const [y, m] = period.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const from = new Date(Date.UTC(y, m - 1, 1));
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const to = new Date(Date.UTC(y, m - 1, lastDay));
  return { from, to };
}

/** Fetch one metric for one network over the month, trying each candidate name. */
async function fetchOneMetric(
  blogId: string,
  apiName: string,
  key: SocialMonthlyMetric,
  fromIso: string,
  toIso: string,
  override: Record<string, Record<string, unknown>>,
): Promise<SocialMetricFetch> {
  const names = resolveSocialMetricNames(apiName, key, override);
  const kind = SOCIAL_METRIC_KIND[key];
  const tried: string[] = [];
  for (const name of names) {
    tried.push(name);
    let value: number | null = null;
    try {
      const series = await metricoolV2Timeline(blogId, apiName, name, "account", fromIso, toIso);
      value = reduceMonthly(kind, series);
    } catch {
      value = null; // invalid metric / not connected — try the next candidate
    }
    if (value !== null) return { key, value, usedName: name, tried };
  }
  return { key, value: null, usedName: null, tried };
}

/** Fetch all six monthly metrics for one network (blog) over the month window. */
export async function fetchNetworkMonth(
  blogId: string,
  apiName: string,
  period: string,
): Promise<{ metrics: SocialMetricFetch[]; timezone: string } | null> {
  const bounds = monthBounds(period);
  if (!bounds) return null;
  const fromIso = toTzIso(bounds.from, false);
  const toIso = toTzIso(bounds.to, true);
  const override = parseSocialMetricMap(process.env.METRICOOL_SOCIAL_METRIC_MAP);

  // Fetch the six metrics concurrently (each tries its own candidate names).
  const metrics = await Promise.all(
    SOCIAL_MONTHLY_METRICS.map((key) => fetchOneMetric(blogId, apiName, key, fromIso, toIso, override)),
  );
  return { metrics, timezone: metricoolTimezone() };
}
