/**
 * Pure logic for the monthly Social Media sync from Metricool. No I/O here — the
 * fetch wrapper (social-metricool.ts) and orchestration (social-monthly-sync.ts)
 * use these to resolve metric names, reduce a month's daily series, and build the
 * SocialMediaMetrics row. Kept pure so it's unit-tested without the network.
 *
 * The monthly Social section stores SIX metrics per (unit, platform):
 *   impressions · reach · interactions · linkClicks · profileVisits · followersGained
 * Five are FLOW metrics (sum the month's daily values); followersGained is a
 * NET-GAIN metric (last − first of the month's daily follower/subscriber count),
 * so it reflects followers added over the month, never the running total.
 *
 * Exact Metricool metric names vary per account/network. Instagram & Facebook
 * names are confirmed from the weekly integration; TikTok/YouTube are best-effort
 * candidates (a wrong name simply returns no data → the metric stays blank, never
 * a wrong number). Pin any name per account via METRICOOL_SOCIAL_METRIC_MAP.
 */

export const SOCIAL_MONTHLY_METRICS = [
  "impressions",
  "reach",
  "interactions",
  "linkClicks",
  "profileVisits",
  "followersGained",
] as const;

export type SocialMonthlyMetric = (typeof SOCIAL_MONTHLY_METRICS)[number];

/** How a month's daily series reduces to one value. */
export type SocialMetricKind = "flow" | "netgain";

export const SOCIAL_METRIC_KIND: Record<SocialMonthlyMetric, SocialMetricKind> = {
  impressions: "flow",
  reach: "flow",
  interactions: "flow",
  linkClicks: "flow",
  profileVisits: "flow",
  followersGained: "netgain",
};

/** The 4 networks pulled for the monthly Social section. `apiName` is the v2 `network` param. */
export const SOCIAL_NETWORKS: { platform: string; enumValue: SocialPlatformEnum; apiName: string }[] = [
  { platform: "Instagram", enumValue: "INSTAGRAM", apiName: "instagram" },
  { platform: "Facebook", enumValue: "FACEBOOK", apiName: "facebook" },
  { platform: "TikTok", enumValue: "TIKTOK", apiName: "tiktok" },
  { platform: "YouTube", enumValue: "YOUTUBE", apiName: "youtube" },
];

export type SocialPlatformEnum = "INSTAGRAM" | "FACEBOOK" | "TIKTOK" | "YOUTUBE";

/**
 * Candidate metric names per (network api name, metric key), in priority order.
 * The sync tries each and keeps the FIRST that returns data (self-healing against
 * Meta/TikTok/YouTube renames). Instagram/Facebook leads are confirmed; the rest
 * are best-effort. followersGained uses STOCK names only (a running count), since
 * its value is the last−first delta over the month.
 */
const CANDIDATES: Record<string, Record<SocialMonthlyMetric, string[]>> = {
  instagram: {
    impressions: ["views", "impressions"],
    reach: ["reach"],
    interactions: ["interactions", "accounts_engaged", "engagement"],
    linkClicks: ["website_clicks", "link_clicks", "websiteClicks", "profileLinksTaps"],
    profileVisits: ["profile_views", "profileViews"],
    followersGained: ["followers"],
  },
  facebook: {
    impressions: ["page_media_view", "views", "impressions"],
    reach: ["page_impressions_unique", "reach"],
    interactions: ["page_post_engagements", "page_engaged_users", "interactions"],
    linkClicks: ["page_website_clicks", "website_clicks", "link_clicks"],
    profileVisits: ["pageViews", "page_views", "page_views_total"],
    followersGained: ["pageFollows", "followers"],
  },
  tiktok: {
    impressions: ["video_views", "videoViews", "views", "impressions"],
    reach: ["reach"],
    interactions: ["engagement", "interactions", "likes"],
    linkClicks: ["profile_clicks", "link_clicks", "clicks"],
    profileVisits: ["profile_views", "profileViews"],
    followersGained: ["followers", "fans"],
  },
  youtube: {
    impressions: ["impressions", "views"],
    reach: ["views", "uniqueViewers", "reach"],
    interactions: ["likes", "engagement", "comments"],
    linkClicks: ["cardClicks", "clicks"],
    profileVisits: ["channelViews", "profile_views"],
    followersGained: ["subscribers"],
  },
};

/** Parse METRICOOL_SOCIAL_METRIC_MAP (JSON): { network: { metricKey: name | name[] } }. */
export function parseSocialMetricMap(raw: string | undefined): Record<string, Record<string, unknown>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Record<string, unknown>>) : {};
  } catch {
    return {};
  }
}

/**
 * The ordered metric names to try for one (network, metricKey). A pin in the
 * override (string or string[]) REPLACES the defaults so an account can force the
 * exact name; otherwise the built-in candidates are used. Unknown network/metric
 * → empty list (the metric stays blank).
 */
export function resolveSocialMetricNames(
  apiName: string,
  metricKey: SocialMonthlyMetric,
  override: Record<string, Record<string, unknown>> = {},
): string[] {
  const api = apiName.toLowerCase();
  const pinned = override[api]?.[metricKey];
  if (typeof pinned === "string" && pinned.trim()) return [pinned.trim()];
  if (Array.isArray(pinned)) {
    const names = pinned.map((x) => String(x).trim()).filter(Boolean);
    if (names.length) return names;
  }
  const defaults = CANDIDATES[api]?.[metricKey] ?? [];
  // De-dupe while preserving order.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of defaults) {
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** Reduce a month's {sum, first, last} daily series to one value for a metric kind.
 *  flow → the summed days; netgain → last − first (net change), or null if the
 *  endpoints aren't both known. Returns null when nothing usable is present. */
export function reduceMonthly(
  kind: SocialMetricKind,
  series: { sum: number | null; first: number | null; last: number | null },
): number | null {
  if (kind === "netgain") {
    if (series.first === null || series.last === null) return null;
    return Math.round(series.last - series.first);
  }
  return series.sum === null ? null : Math.round(series.sum);
}

/** A SocialMediaMetrics row (the six Int columns), matching the Prisma model. */
export interface SocialRow {
  impressions: number;
  reach: number;
  interactions: number;
  linkClicks: number;
  profileVisits: number;
  followersGained: number;
}

export interface BuiltSocialRow {
  /** All six columns, with an unresolved metric as 0 — for CREATE of a new row. */
  row: SocialRow;
  /** Only the metrics that actually resolved this pull — for UPDATE, so an
   *  unresolved column keeps its previously-stored value instead of being zeroed. */
  resolvedKeys: SocialMonthlyMetric[];
}

/**
 * Build the row for one platform from the resolved per-metric values. Returns
 * null when NOTHING resolved (so an all-blank platform isn't written at all).
 *
 * IMPORTANT: `resolvedKeys` lists only the metrics that came back with data. The
 * caller must UPDATE only those columns (a partial Metricool pull commonly leaves
 * several IG/FB metrics empty) — writing the full `row` on an UPDATE would zero a
 * previously-stored or manually-imported metric that this pull didn't resolve.
 * `row` (null→0) is only for CREATE, where there is no prior value to preserve.
 */
export function buildSocialRow(values: Partial<Record<SocialMonthlyMetric, number | null>>): BuiltSocialRow | null {
  const resolvedKeys: SocialMonthlyMetric[] = [];
  const get = (k: SocialMonthlyMetric): number => {
    const v = values[k];
    if (v !== null && v !== undefined) {
      resolvedKeys.push(k);
      return v;
    }
    return 0;
  };
  const row: SocialRow = {
    impressions: get("impressions"),
    reach: get("reach"),
    interactions: get("interactions"),
    linkClicks: get("linkClicks"),
    profileVisits: get("profileVisits"),
    followersGained: get("followersGained"),
  };
  return resolvedKeys.length === 0 ? null : { row, resolvedKeys };
}
