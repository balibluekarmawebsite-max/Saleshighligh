/**
 * Metricool metric-name discovery (offline probe).
 *
 * Problem: Section H's flow metrics (reach / impressions / profile visits /
 * website clicks) live on Metricool's modern per-account analytics endpoints,
 * whose exact metric names vary per account and network. This script probes a
 * broad candidate list against the real account — using the server's token — and
 * prints which names return data, with their summed + last value, so each can be
 * matched against the numbers shown in the Metricool UI and locked in via
 * METRICOOL_METRIC_MAP. No browser DevTools needed.
 *
 * Usage (on the VPS, from the app directory):
 *   npx tsx scripts/metricool-discover.ts <blogId|propertyCode> [network]
 *
 *     <blogId|propertyCode>  a numeric Metricool blogId, or a property code
 *                            (BKDS / BKDU / BKV) resolved from the database.
 *     [network]              instagram | facebook   (default: both)
 *
 *   e.g.  npx tsx scripts/metricool-discover.ts BKV
 *         npx tsx scripts/metricool-discover.ts 2929192 instagram
 *
 * Reads METRICOOL_USER_TOKEN / METRICOOL_USER_ID (and the optional API base /
 * timezone overrides) from .env in the current directory. Read-only — it makes
 * GET requests only and writes nothing.
 */
import { readFileSync } from "node:fs";

// ── .env loader (tolerant of quoted and unquoted values) ─────────────────────
function loadEnv(path = ".env"): void {
  let txt: string;
  try {
    txt = readFileSync(path, "utf8");
  } catch {
    return; // no .env file — fall back to the real environment
  }
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    let val = m[2] ?? "";
    if (!key) continue;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

// ── value coercion + series readers (Metricool sends numbers as strings) ─────
function finite(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pointValue(pt: unknown): number | null {
  const f = finite(pt);
  if (f !== null) return f;
  if (Array.isArray(pt)) {
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

interface Series {
  sum: number | null;
  last: number | null;
  n: number;
}

/** Summarise a /v2/analytics/timelines response for one metric. */
function readTimeline(data: unknown, metric?: string): Series {
  let node: unknown = data;
  if (node && typeof node === "object" && !Array.isArray(node) && "data" in (node as Record<string, unknown>)) {
    node = (node as Record<string, unknown>).data;
  }
  if (!Array.isArray(node)) return { sum: null, last: null, n: 0 };

  // Case A: array of series objects { metric, values: [{dateTime, value}, …] }.
  const seriesObjs = node.filter(
    (x): x is Record<string, unknown> =>
      !!x && typeof x === "object" && !Array.isArray(x) && Array.isArray((x as Record<string, unknown>).values),
  );
  let points: unknown[];
  if (seriesObjs.length) {
    const match = metric
      ? seriesObjs.find((s) => String(s.metric).toLowerCase() === metric.toLowerCase())
      : undefined;
    const chosen = match ?? seriesObjs[0];
    points = (chosen?.values as unknown[]) ?? [];
  } else {
    // Case B: a flat point array [[ts, "val"], …].
    points = node;
  }

  const nums = points.map(pointValue).filter((v): v is number => v !== null);
  if (!nums.length) return { sum: null, last: null, n: 0 };
  return { sum: nums.reduce((a, b) => a + b, 0), last: nums[nums.length - 1] ?? null, n: nums.length };
}

// ── Metricool GET ────────────────────────────────────────────────────────────
function apiBase(): string {
  return (process.env.METRICOOL_API_BASE || "https://app.metricool.com/api").replace(/\/+$/, "");
}
function timezone(): string {
  return process.env.METRICOOL_TIMEZONE || "Asia/Makassar";
}
function tzOffset(): string {
  return process.env.METRICOOL_TZ_OFFSET || "+08:00";
}

interface GetResult {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
}

async function mcGet(path: string, params: Record<string, string>): Promise<GetResult> {
  const token = process.env.METRICOOL_USER_TOKEN ?? "";
  const userId = process.env.METRICOOL_USER_ID ?? "";
  const url = new URL(`${apiBase()}${path.startsWith("/") ? "" : "/"}${path}`);
  url.searchParams.set("userId", userId);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { headers: { "X-Mc-Auth": token, Accept: "application/json" } });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON (e.g. an HTML error page) */
  }
  return { ok: res.ok, status: res.status, json, text };
}

// ── candidate metric names per network (broad; wrong guesses just return —) ──
// Confirmed on BKV so far: instagram reach / views / followers return data.
// The lists add snake_case + the 2024 Instagram metric set so profile-visit and
// website-click names get covered too.
const CANDIDATES: Record<string, string[]> = {
  instagram: [
    // confirmed
    "reach",
    "views",
    "followers",
    // impressions (older name for views)
    "impressions",
    "impressionsUnique",
    // profile visits
    "profileViews",
    "profileVisits",
    "profile_views",
    "profile_visits",
    "visits",
    // website / link clicks
    "websiteClicks",
    "website_clicks",
    "websiteTaps",
    "linkClicks",
    "link_clicks",
    "externalLinkTaps",
    "profileLinksTaps",
    "profile_links_taps",
    // engagement family
    "accountsEngaged",
    "accounts_engaged",
    "accountsReached",
    "accounts_reached",
    "totalInteractions",
    "total_interactions",
    "interactions",
    "engagement",
    // followers / reach variants + contacts
    "follows",
    "follower_count",
    "followerCount",
    "igFollowers",
    "getDirectionsClicks",
    "get_directions_clicks",
    "emailContacts",
    "email_contacts",
    "phoneCallClicks",
    "phone_call_clicks",
    "textMessageClicks",
    "text_message_clicks",
  ],
  facebook: [
    // previously observed on this account
    "pageViews",
    "page_media_view",
    "pageFollows",
    "postsCount",
    // reach / impressions
    "pageReach",
    "page_reach",
    "pageImpressions",
    "page_impressions",
    "pageImpressionsUnique",
    "page_impressions_unique",
    "pageMediaView",
    "page_views",
    "pageViews_total",
    "page_views_total",
    // fans / engagement / actions
    "pageFans",
    "page_fans",
    "pageFanAdds",
    "pageEngagedUsers",
    "page_engaged_users",
    "pagePostEngagements",
    "page_post_engagements",
    "pageConsumptions",
    "page_consumptions",
    "pageVideoViews",
    "page_video_views",
    "pageTotalActions",
    "page_total_actions",
    "pageCtaClicks",
    "page_cta_clicks",
    // bare names (in case FB shares IG naming on this account)
    "reach",
    "impressions",
    "views",
    "websiteClicks",
    "profileVisits",
    "followers",
  ],
};

/** The FB names we've seen work before — re-checked without a subject param too. */
const FB_KNOWN = ["pageViews", "page_media_view", "pageFollows", "postsCount"];

function fmt(n: number | null): string {
  return n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

async function resolveTarget(arg: string): Promise<{ blogId: string; label: string }> {
  if (/^\d+$/.test(arg)) return { blogId: arg, label: `blogId ${arg}` };
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    const prop = await prisma.property.findUnique({
      where: { code: arg.toUpperCase() },
      select: { id: true, name: true },
    });
    if (!prop) throw new Error(`No property with code "${arg.toUpperCase()}".`);
    const row = await prisma.weeklySetting.findFirst({
      where: { propertyId: prop.id, group: "metricool", key: "blogId" },
      select: { value: true },
    });
    const v = row?.value;
    const blogId = v == null ? null : typeof v === "string" ? v : String(v);
    if (!blogId) {
      throw new Error(`Property ${arg.toUpperCase()} has no Metricool blogId assigned (Settings → Social Media).`);
    }
    return { blogId, label: `${prop.name} (${arg.toUpperCase()}) · blogId ${blogId}` };
  } finally {
    await prisma.$disconnect();
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Spacing between calls so the sweep doesn't trip Metricool's rate limit. */
const THROTTLE_MS = 220;

/** Pull a short failure reason (title/code/message) out of an error body. */
function reason(r: GetResult): string {
  const j = r.json;
  if (j && typeof j === "object") {
    const o = j as Record<string, unknown>;
    const t = o.title ?? o.error ?? o.message ?? o.code;
    if (typeof t === "string" && t) return `${r.status} ${t}`;
  }
  return `HTTP ${r.status}`;
}

function bump(m: Map<string, number>, k: string): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

/**
 * Sweep a list of metric names against /v2/analytics/timelines and print the
 * ones that return data. Non-hits are tallied by reason (so "rate-limited" is
 * distinguishable from "invalid name" and "no data"). subject is included only
 * when given. 429s are retried once after a longer pause.
 */
async function sweepTimelines(
  blogId: string,
  network: string,
  names: string[],
  fromIso: string,
  toIso: string,
  subject: string | null,
): Promise<void> {
  const label = subject === null ? "(no subject)" : `(subject=${subject})`;
  console.log(`\n  /v2/analytics/timelines  ${label}`);
  const breakdown = new Map<string, number>();
  const emptyNames: string[] = []; // valid names (200) that returned no datapoints
  let firstError: { reason: string; body: string } | null = null;
  let hits = 0;
  for (const metric of names) {
    const params: Record<string, string> = { blogId, from: fromIso, to: toIso, metric, network, timezone: timezone() };
    if (subject !== null) params.subject = subject;

    let r: GetResult;
    try {
      r = await mcGet("/v2/analytics/timelines", params);
      if (r.status === 429) {
        await sleep(2500);
        r = await mcGet("/v2/analytics/timelines", params);
      }
    } catch (err) {
      bump(breakdown, `request-failed (${err instanceof Error ? err.message : "error"})`);
      await sleep(THROTTLE_MS);
      continue;
    }

    if (!r.ok) {
      bump(breakdown, reason(r));
      if (!firstError) firstError = { reason: reason(r), body: r.text.replace(/\s+/g, " ").trim().slice(0, 240) };
      await sleep(THROTTLE_MS);
      continue;
    }
    const s = readTimeline(r.json, metric);
    if (s.sum === null) {
      bump(breakdown, "200 but empty");
      emptyNames.push(metric);
      await sleep(THROTTLE_MS);
      continue;
    }
    hits++;
    console.log(
      `    ✓ ${metric.padEnd(22)} sum=${fmt(s.sum).padStart(14)}   last=${fmt(s.last).padStart(12)}   (n=${s.n})`,
    );
    await sleep(THROTTLE_MS);
  }
  if (!hits) console.log(`    (no data from ${names.length} candidates)`);
  if (emptyNames.length) console.log(`    valid but empty (name OK, no data): ${emptyNames.join(", ")}`);
  if (breakdown.size) {
    const parts = [...breakdown.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v}× ${k}`);
    console.log(`    skipped: ${parts.join("  ·  ")}`);
  }
  if (firstError) console.log(`    first error body: ${firstError.body}`);
}

interface Catalog {
  validList: string[] | null;
  note: string;
  status: number;
}

/**
 * Ask Metricool for its own list of valid account metrics by sending a
 * deliberately-invalid name: its 400 error echoes "Valid values are: [...]".
 * Catalog-driven beats guessing. Returns the parsed list, or a note explaining
 * why it couldn't (e.g. a 403 "no connection" for a network that isn't linked).
 */
async function fetchValidMetrics(
  blogId: string,
  network: string,
  subject: string,
  fromIso: string,
  toIso: string,
): Promise<Catalog> {
  const params: Record<string, string> = {
    blogId,
    from: fromIso,
    to: toIso,
    metric: "__catalog_probe__",
    network,
    subject,
    timezone: timezone(),
  };
  let r: GetResult;
  try {
    r = await mcGet("/v2/analytics/timelines", params);
  } catch (err) {
    return { validList: null, note: `request failed: ${err instanceof Error ? err.message : "error"}`, status: 0 };
  }
  const m = /valid values are:\s*\[([^\]]*)\]/i.exec(r.text);
  if (m && m[1]) {
    const list = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length) return { validList: list, note: `from ${r.status} enum error`, status: r.status };
  }
  return { validList: null, note: `${reason(r)} — ${r.text.replace(/\s+/g, " ").trim().slice(0, 240)}`, status: r.status };
}

async function probeNetwork(blogId: string, network: string, fromIso: string, toIso: string): Promise<void> {
  console.log(`\n=== ${network.toUpperCase()} — blogId ${blogId} ===`);

  // Catalog-driven: let the API tell us its valid metric names, then probe those.
  const cat = await fetchValidMetrics(blogId, network, "account", fromIso, toIso);
  if (cat.validList && cat.validList.length) {
    console.log(`\n  valid account metrics reported by API (${cat.validList.length}):`);
    console.log(`    ${cat.validList.join(", ")}`);
    await sweepTimelines(blogId, network, cat.validList, fromIso, toIso, "account");
    return;
  }

  // No catalog (e.g. a 403 because the network isn't connected to this blog).
  console.log(`\n  could not read a metric catalog — ${cat.note}`);
  await sweepTimelines(blogId, network, CANDIDATES[network] ?? [], fromIso, toIso, "account");
  if (network === "facebook") {
    await sweepTimelines(blogId, network, FB_KNOWN, fromIso, toIso, null);
  }
}

/** List the brands on the login (so an unexpected blogId in an error is identifiable). */
async function listBrands(targetBlogId: string): Promise<void> {
  let r: GetResult;
  try {
    r = await mcGet("/admin/simpleProfiles", {});
  } catch (err) {
    console.log(`\nBrands: could not fetch (${err instanceof Error ? err.message : "error"})`);
    return;
  }
  if (!r.ok) {
    console.log(`\nBrands: ${reason(r)}`);
    return;
  }
  const data = r.json;
  const arr: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as Record<string, unknown>).data)
      ? ((data as Record<string, unknown>).data as unknown[])
      : [];
  console.log(`\nMetricool brands on this login (${arr.length}):`);
  let target: Record<string, unknown> | null = null;
  for (const b of arr) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const blogId = String(o.blogId ?? o.id ?? "");
    const label = String(o.label ?? o.brand ?? o.title ?? o.name ?? "");
    const marker = blogId === targetBlogId ? "  ← target" : "";
    console.log(`  ${blogId.padEnd(10)} ${label}${marker}`);
    if (blogId === targetBlogId) target = o;
  }
  if (target) {
    const flags: string[] = [];
    for (const [k, v] of Object.entries(target)) {
      if (!/facebook|instagram|twitter|tiktok|youtube|linkedin|gmb|google|pinterest|threads|twitch/i.test(k)) continue;
      const on = v && typeof v === "object" ? Object.keys(v as object).length > 0 : Boolean(v);
      flags.push(`${k}=${typeof v === "object" ? (on ? "{…}" : "null") : String(v)}`);
    }
    console.log(`\n  connections for target blogId ${targetBlogId}:`);
    console.log(`    ${flags.length ? flags.join("  ·  ") : "(no obvious network fields — raw below)"}`);
    console.log(`    raw: ${JSON.stringify(target).slice(0, 900)}`);
  }
}

async function main(): Promise<void> {
  loadEnv();
  const target = process.argv[2];
  const netArg = (process.argv[3] || "").toLowerCase();
  if (!target) {
    console.error("Usage: npx tsx scripts/metricool-discover.ts <blogId|propertyCode> [instagram|facebook]");
    process.exit(1);
    return;
  }
  if (!process.env.METRICOOL_USER_TOKEN || !process.env.METRICOOL_USER_ID) {
    console.error("METRICOOL_USER_TOKEN / METRICOOL_USER_ID not found (looked in .env and the environment).");
    process.exit(1);
    return;
  }

  const networks = netArg === "instagram" || netArg === "facebook" ? [netArg] : ["instagram", "facebook"];

  const { blogId, label } = await resolveTarget(target);

  // A recent ~5-week window, maximising the chance that each metric has data.
  const off = tzOffset();
  const now = new Date();
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - 35 * 86_400_000).toISOString().slice(0, 10);
  const fromIso = `${start}T00:00:00${off}`;
  const toIso = `${end}T23:59:59${off}`;

  console.log(`Target : ${label}`);
  console.log(`Window : ${start} → ${end}  (tz ${timezone()} ${off})`);
  console.log(`Legend : "sum" totals the daily values (use for flow metrics:`);
  console.log(`         reach / impressions / profile visits / website clicks);`);
  console.log(`         "last" is the latest day's value (use for stock: followers).`);
  console.log(`Note   : throttled ~${THROTTLE_MS}ms/request — a full run takes ~30–60s. Please wait.`);

  await listBrands(blogId);

  for (const network of networks) {
    await probeNetwork(blogId, network, fromIso, toIso);
  }

  console.log(
    `\nNext: match a "sum" (or "last") above against the figure shown in Metricool's` +
      ` ${networks.join(" / ")} Account tab for the same window, then set METRICOOL_METRIC_MAP.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
