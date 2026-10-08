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
// Section H pulls five metrics per network from two Metricool APIs (confirmed
// live against the account):
//   • Followers — v1 `GET /stats/timeline/{ig|fb}Followers?start=&end=`
//     (YYYYMMDD), returns [[epochOrDate, "value"], …]; take the LAST value → the
//     follower count, so this-week − last-week is net growth.
//   • Reach / Impressions(Views) / Profile visits / Website clicks — v2
//     `GET /v2/analytics/aggregation?from=&to=&metric=&network=&subject=`
//     (ISO datetimes with tz), returns {"data": N}. The modern IG/FB insight
//     metrics live only here, not on v1. The exact metric + subject names vary
//     per account/network, so they are configured via METRICOOL_METRIC_MAP.
//
// Values come back as strings and timestamps as epoch-ms, so the readers coerce
// strings → numbers and never throw on an odd/empty shape — they return null and
// the metric is simply left blank.

/** Format a Date as the `YYYYMMDD` the v1 stats endpoints expect (UTC). */
export function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/** Metricool timezone for the v2 analytics window (Bali = UTC+8, no DST). */
export function metricoolTimezone(): string {
  return process.env.METRICOOL_TIMEZONE || "Asia/Makassar";
}
function metricoolTzOffset(): string {
  return process.env.METRICOOL_TZ_OFFSET || "+08:00";
}

/** A Date → ISO datetime in Metricool's timezone, e.g. `2026-10-02T00:00:00+08:00`. */
export function toTzIso(d: Date, endOfDay: boolean): string {
  const day = d.toISOString().slice(0, 10);
  return `${day}T${endOfDay ? "23:59:59" : "00:00:00"}${metricoolTzOffset()}`;
}

// Metricool returns numeric values as strings ("1361.0") and timestamps as
// epoch-millis, so coerce numeric strings to numbers here.
const finite = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** Pull a numeric value out of one timeline point (number, [ts,val], or {value}). */
function pointValue(pt: unknown): number | null {
  const f = finite(pt);
  if (f !== null) return f;
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
  const f = finite(data);
  if (f !== null) return f;
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

/**
 * GET /v2/analytics/aggregation — one aggregate value for a modern insight
 * metric. Returns {"data": N} (N may be a string); readAggregate unwraps it.
 */
export async function metricoolV2Aggregate(
  blogId: string,
  network: string,
  metric: string,
  subject: string,
  fromIso: string,
  toIso: string,
): Promise<number | null> {
  const data = await metricoolGet<unknown>("/v2/analytics/aggregation", {
    blogId,
    params: { from: fromIso, to: toIso, metric, network, subject, timezone: metricoolTimezone() },
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

/** Networks we pull for Section H (Instagram + Facebook). `apiName` is the v2 `network` param. */
export const METRICOOL_NETWORKS: { platform: string; prefix: string; apiName: string }[] = [
  { platform: "Instagram", prefix: "ig", apiName: "instagram" },
  { platform: "Facebook", prefix: "fb", apiName: "facebook" },
];

type MetricKind = "flow" | "stock";

/** How one Section-H metric is fetched for one network. */
export interface MetricSource {
  source: "timeline" | "v2agg";
  name?: string; // v1 timeline metric name (e.g. "igFollowers")
  metric?: string; // v2 metric name (e.g. "reach")
  subject?: string; // v2 subject (e.g. "account")
}

/**
 * The 5 Section H metrics, their kind, and the DEFAULT per-network source.
 *
 * - Followers come from the v1 timeline (`{ig|fb}Followers`) — confirmed working.
 * - Reach / Impressions(Views) / Profile visits / Website clicks come from the
 *   v2 aggregation endpoint. The metric + subject names below are best-effort
 *   defaults; the real names differ per account and are set via
 *   METRICOOL_METRIC_MAP (no redeploy needed) — until then these stay blank.
 */
const SECTION_H: Record<string, { kind: MetricKind; def: (prefix: string) => MetricSource }> = {
  account_reached: { kind: "flow", def: () => ({ source: "v2agg", metric: "reach", subject: "account" }) },
  impression: { kind: "flow", def: () => ({ source: "v2agg", metric: "views", subject: "account" }) },
  profile_visit: { kind: "flow", def: () => ({ source: "v2agg", metric: "profileVisits", subject: "account" }) },
  website_visit: { kind: "flow", def: () => ({ source: "v2agg", metric: "websiteClicks", subject: "account" }) },
  followers: { kind: "stock", def: (p) => ({ source: "timeline", name: `${p}Followers` }) },
};

/** The Section H metric keys Metricool can fill, in report order. */
export const METRICOOL_METRIC_KEYS = Object.keys(SECTION_H);

export function metricKind(metricKey: string): MetricKind {
  return SECTION_H[metricKey]?.kind ?? "flow";
}

/**
 * Per-network metric overrides from METRICOOL_METRIC_MAP (JSON). Keyed by the
 * network's api name ("instagram"/"facebook") then the Section-H metric key.
 * A value may be:
 *   - a string  → the v2 metric name (keeps the default subject), or the
 *                 timeline name for followers; or
 *   - an object → {source?, name?, metric?, subject?} merged over the default.
 * Example (set after confirming names against the account):
 *   {"instagram":{"account_reached":{"metric":"reach","subject":"account"},
 *                 "impression":{"metric":"views","subject":"account"}},
 *    "facebook":{"impression":{"metric":"views","subject":"account"}}}
 */
function metricMapOverride(): Record<string, Record<string, unknown>> {
  const raw = process.env.METRICOOL_METRIC_MAP;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, Record<string, unknown>>) : {};
  } catch {
    return {};
  }
}

/** Resolve the fetch source for one (network api name, metric key), applying env overrides. */
export function resolveMetricSource(apiName: string, prefix: string, metricKey: string): MetricSource | null {
  const spec = SECTION_H[metricKey];
  if (!spec) return null;
  const base = spec.def(prefix);
  const ov = metricMapOverride()[apiName.toLowerCase()]?.[metricKey];
  if (ov == null) return base;
  if (typeof ov === "string") {
    return base.source === "timeline" ? { ...base, name: ov } : { ...base, metric: ov };
  }
  if (typeof ov === "object") {
    const o = ov as Partial<MetricSource>;
    const merged: MetricSource = { ...base, ...o };
    if (!o.source) {
      if (o.metric || o.subject) merged.source = "v2agg";
      else if (o.name) merged.source = "timeline";
    }
    return merged;
  }
  return base;
}

/** A short human label for a source (shown in the sync diagnostic). */
export function sourceLabel(s: MetricSource | null): string | null {
  if (!s) return null;
  return s.source === "timeline"
    ? `${s.name ?? "?"} (timeline)`
    : `${s.metric ?? "?"}@${s.subject ?? "account"} (v2)`;
}

/**
 * Fetch one metric value for a resolved source over a [from,to] Date range.
 * Returns null on an invalid metric / no data (never throws), so a metric that
 * isn't configured yet simply stays blank.
 */
export async function fetchMetricForRange(
  blogId: string,
  apiName: string,
  source: MetricSource,
  from: Date,
  to: Date,
): Promise<number | null> {
  try {
    if (source.source === "timeline" && source.name) {
      return await metricoolTimelineLast(blogId, source.name, toYmd(from), toYmd(to));
    }
    if (source.source === "v2agg" && source.metric) {
      return await metricoolV2Aggregate(
        blogId,
        apiName,
        source.metric,
        source.subject ?? "account",
        toTzIso(from, false),
        toTzIso(to, true),
      );
    }
  } catch {
    // invalid metric / no data for this account — leave the metric blank
  }
  return null;
}
