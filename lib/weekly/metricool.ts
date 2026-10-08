/**
 * Metricool integration for Section H (Social Media Insight).
 *
 * Model: one Metricool login (a single user token + user id, held in server
 * env) with a separate brand ("blogId") per property. The per-property blogId
 * is stored in the existing WeeklySetting table (group "metricool", key
 * "blogId") so it can be assigned from the UI — no schema change.
 *
 * Auth (per Metricool's API): every call sends the token in an `X-Mc-Auth`
 * header plus `userId` and `blogId` query parameters. `/admin/simpleProfiles`
 * lists the brands tied to the account, each with its blogId.
 *   https://static.metricool.com/API+DOC/API+English.pdf
 */

import { prisma } from "@/lib/prisma";

export function metricoolApiBase(): string {
  return (process.env.METRICOOL_API_BASE || "https://app.metricool.com/api").replace(/\/+$/, "");
}

export function metricoolUserId(): string {
  return process.env.METRICOOL_USER_ID || "";
}

/** True when the shared Metricool credential (token + user id) is set. */
export function isMetricoolConfigured(): boolean {
  return !!process.env.METRICOOL_USER_TOKEN && !!metricoolUserId();
}

export interface MetricoolBrand {
  blogId: string;
  label: string;
}

/** A Metricool GET with auth header + userId/blogId query params. */
export async function metricoolGet<T = unknown>(
  path: string,
  opts: { blogId?: string; params?: Record<string, string> } = {},
): Promise<T> {
  const token = process.env.METRICOOL_USER_TOKEN;
  const userId = metricoolUserId();
  if (!token || !userId) throw new Error("Metricool is not configured (METRICOOL_USER_TOKEN / METRICOOL_USER_ID).");

  const url = new URL(`${metricoolApiBase()}${path.startsWith("/") ? "" : "/"}${path}`);
  // Per Metricool's docs the token authenticates via the X-Mc-Auth header only;
  // keep it out of the query string so the secret never lands in a URL/log.
  url.searchParams.set("userId", userId);
  if (opts.blogId) url.searchParams.set("blogId", opts.blogId);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "X-Mc-Auth": token, Accept: "application/json" },
    });
  } catch (err) {
    throw new Error(`Could not reach Metricool: ${err instanceof Error ? err.message : "network error"}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Metricool API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** List the brands (accounts) tied to the Metricool login. */
export async function listMetricoolBrands(): Promise<MetricoolBrand[]> {
  // Some docs pass a blogId too; it is not required to enumerate brands.
  const data = await metricoolGet<unknown>("/admin/simpleProfiles");
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: unknown[] })?.data)
      ? (data as { data: unknown[] }).data
      : [];
  return arr
    .map((b): MetricoolBrand | null => {
      if (!b || typeof b !== "object") return null;
      const rec = b as Record<string, unknown>;
      const blogId = rec.blogId ?? rec.id;
      if (blogId == null) return null;
      const label =
        (rec.label as string) ?? (rec.brand as string) ?? (rec.title as string) ?? (rec.name as string) ?? String(blogId);
      return { blogId: String(blogId), label: String(label) };
    })
    .filter((b): b is MetricoolBrand => b !== null);
}

/** The Metricool blogId assigned to a property, or null. */
export async function getPropertyBlogId(propertyCode: string): Promise<string | null> {
  const prop = await prisma.property.findUnique({ where: { code: propertyCode }, select: { id: true } });
  if (!prop) return null;
  const row = await prisma.weeklySetting.findFirst({
    where: { propertyId: prop.id, group: "metricool", key: "blogId" },
    select: { value: true },
  });
  if (!row || row.value == null) return null;
  const v = row.value;
  return typeof v === "string" ? v : String(v);
}

// ── Analytics ────────────────────────────────────────────────────────────────
//
// The v1 `/stats` endpoints take dates as YYYYMMDD and cover the metrics we
// need for Section H. Two shapes matter:
//   • GET /stats/aggregation/{metric}?start=&end=  → one aggregated value for a
//     "flow" metric (reach, impressions, profile views, website clicks) over a
//     range.
//   • GET /stats/timeline/{metric}?start=&end=     → a daily series; for a
//     "stock" metric (followers) we take the last value in the range so that
//     this-week minus last-week is the net gain.
// Endpoint paths + metric names confirmed against Metricool's documented API
// (PDF: /stats/timeling/igFollowers example) and its published clients.
//
// Response envelopes vary (a bare number, {total}, {values:[…]}, [[ts,val],…]),
// so both readers are deliberately tolerant and never throw on an odd shape —
// they return null, and the caller tries the next candidate metric name.

/** Format a Date as the `YYYYMMDD` the v1 stats endpoints expect (UTC). */
export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

const finite = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Pull a numeric value out of one timeline point (number, [ts,val], or {value}). */
function pointValue(pt: unknown): number | null {
  if (finite(pt) !== null) return pt as number;
  if (Array.isArray(pt)) {
    // [timestamp, value] — value is the last numeric element.
    for (let i = pt.length - 1; i >= 0; i--) {
      const x = finite(pt[i]);
      if (x !== null) return x;
    }
    return null;
  }
  if (pt && typeof pt === "object") {
    const r = pt as Record<string, unknown>;
    for (const k of ["value", "count", "total", "y", "data"]) {
      const x = finite(r[k]);
      if (x !== null) return x;
    }
  }
  return null;
}

/** Tolerantly reduce an aggregation response to a single total. */
export function readAggregate(data: unknown): number | null {
  if (finite(data) !== null) return data as number;
  if (Array.isArray(data)) {
    const vals = data.map(pointValue).filter((v): v is number => v !== null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  }
  if (data && typeof data === "object") {
    const r = data as Record<string, unknown>;
    for (const k of ["total", "value", "sum", "count", "aggregation", "result"]) {
      const x = finite(r[k]);
      if (x !== null) return x;
    }
    if (Array.isArray(r.values)) return readAggregate(r.values);
    if (r.data !== undefined) return readAggregate(r.data);
  }
  return null;
}

/** Tolerantly read the last non-null value of a timeline response. */
export function readLast(data: unknown): number | null {
  const arr = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (((data as Record<string, unknown>).values ?? (data as Record<string, unknown>).data) as unknown)
      : null;
  if (Array.isArray(arr)) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const v = pointValue(arr[i]);
      if (v !== null) return v;
    }
    return null;
  }
  // Not a series — fall back to a single value.
  return readAggregate(data);
}

/** GET /stats/aggregation/{metric} for a blog over [start,end] (YYYYMMDD). */
export async function metricoolAggregate(
  blogId: string,
  metric: string,
  start: string,
  end: string,
): Promise<number | null> {
  const data = await metricoolGet<unknown>(`/stats/aggregation/${encodeURIComponent(metric)}`, {
    blogId,
    params: { start, end },
  });
  return readAggregate(data);
}

/** GET /stats/timeline/{metric} for a blog over [start,end]; returns the last value. */
export async function metricoolTimelineLast(
  blogId: string,
  metric: string,
  start: string,
  end: string,
): Promise<number | null> {
  const data = await metricoolGet<unknown>(`/stats/timeline/${encodeURIComponent(metric)}`, {
    blogId,
    params: { start, end },
  });
  return readLast(data);
}

/** Networks we pull for Section H (confirmed with the user: Instagram + Facebook). */
export const METRICOOL_NETWORKS: { platform: string; prefix: string }[] = [
  { platform: "Instagram", prefix: "ig" },
  { platform: "Facebook", prefix: "fb" },
];

type MetricKind = "flow" | "stock";

/**
 * The 5 Section H metric rows → Metricool metric-name candidates, in priority
 * order. The exact spelling varies by Metricool API version, so we try each
 * candidate until one returns a usable value and remember which worked (shown
 * in the sync diagnostic). `flow` metrics are summed via /aggregation; `stock`
 * metrics (followers) take the last /timeline value so growth = net gain.
 *
 * Override a single mapping without a redeploy via the METRICOOL_METRIC_MAP env
 * (JSON, e.g. {"instagram":{"impression":"igViews"}}); an override becomes the
 * only candidate tried for that (network, metric).
 */
const METRIC_CANDIDATES: Record<string, { kind: MetricKind; names: (prefix: string) => string[] }> = {
  account_reached: { kind: "flow", names: (p) => [`${p}Reach`, "reach"] },
  impression: { kind: "flow", names: (p) => [`${p}Impressions`, "impressions", `${p}Views`, "views"] },
  profile_visit: {
    kind: "flow",
    names: (p) => [`${p}ProfileViews`, `${p}ProfileVisits`, `${p}PageViews`, "profileViews", "profileVisits"],
  },
  website_visit: {
    kind: "flow",
    names: (p) => [`${p}WebsiteClicks`, `${p}WebsiteTaps`, `${p}WebsiteVisits`, "websiteClicks", "clicks"],
  },
  followers: { kind: "stock", names: (p) => [`${p}Followers`, "followers"] },
};

/** The Section H metric keys Metricool can fill, in report order. */
export const METRICOOL_METRIC_KEYS = Object.keys(METRIC_CANDIDATES);

function metricMapOverride(): Record<string, Record<string, string>> {
  const raw = process.env.METRICOOL_METRIC_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Record<string, string>>) : {};
  } catch {
    return {};
  }
}

/** Ordered candidate metric names for one (network, Section-H metric key). */
export function candidateMetricNames(networkPlatform: string, prefix: string, metricKey: string): string[] {
  const spec = METRIC_CANDIDATES[metricKey];
  if (!spec) return [];
  const override = metricMapOverride()[networkPlatform.toLowerCase()]?.[metricKey];
  if (override) return [override];
  return spec.names(prefix);
}

export function metricKind(metricKey: string): MetricKind {
  return METRIC_CANDIDATES[metricKey]?.kind ?? "flow";
}

/** Fetch one *exact* Metricool metric name over a range (no candidate probing). */
export async function fetchMetricByName(
  blogId: string,
  name: string,
  kind: MetricKind,
  start: string,
  end: string,
): Promise<number | null> {
  try {
    return kind === "stock"
      ? await metricoolTimelineLast(blogId, name, start, end)
      : await metricoolAggregate(blogId, name, start, end);
  } catch {
    return null;
  }
}

/**
 * Fetch one Section-H metric for one blog over a range, trying each candidate
 * name until one returns a value. Returns the value and the name that worked
 * (or the attempted names when nothing resolved) — no throw on a missing metric.
 */
export async function fetchMetricValue(
  blogId: string,
  networkPlatform: string,
  prefix: string,
  metricKey: string,
  start: string,
  end: string,
): Promise<{ value: number | null; metric: string | null; tried: string[] }> {
  const names = candidateMetricNames(networkPlatform, prefix, metricKey);
  const kind = metricKind(metricKey);
  const tried: string[] = [];
  for (const name of names) {
    tried.push(name);
    try {
      const value = kind === "stock"
        ? await metricoolTimelineLast(blogId, name, start, end)
        : await metricoolAggregate(blogId, name, start, end);
      if (value !== null) return { value, metric: name, tried };
    } catch {
      // metric name not valid for this account/network — try the next candidate
    }
  }
  return { value: null, metric: null, tried };
}
