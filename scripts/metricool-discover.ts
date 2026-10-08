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

/** Reduce a /v2/analytics/aggregation response ({data:N}) to a number. */
function readAggregate(data: unknown): number | null {
  const f = finite(data);
  if (f !== null) return f;
  if (data && typeof data === "object") {
    const r = data as Record<string, unknown>;
    for (const k of ["data", "total", "value", "sum", "count"]) {
      if (r[k] !== undefined) {
        const x = finite(r[k]);
        if (x !== null) return x;
      }
    }
  }
  return null;
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
const CANDIDATES: Record<string, string[]> = {
  instagram: [
    "reach",
    "impressions",
    "views",
    "impressionsUnique",
    "profileViews",
    "profileVisits",
    "websiteClicks",
    "website_clicks",
    "getDirectionsClicks",
    "accountsReached",
    "accounts_reached",
    "accountsEngaged",
    "totalInteractions",
    "interactions",
    "engagement",
    "follows",
    "followers",
    "igFollowers",
    "likes",
    "comments",
    "saves",
    "shares",
    "reelsPlays",
    "storyReplies",
    "externalLinkTaps",
    "profileLinksTaps",
    "emailContacts",
    "phoneCallClicks",
    "textMessageClicks",
  ],
  facebook: [
    "pageReach",
    "page_reach",
    "pageImpressions",
    "page_impressions",
    "pageImpressionsUnique",
    "page_impressions_unique",
    "page_media_view",
    "pageMediaView",
    "pageViews",
    "page_views",
    "pageViews_total",
    "pageFollows",
    "pageFans",
    "page_fans",
    "pageFanAdds",
    "pageEngagedUsers",
    "page_engaged_users",
    "pagePostEngagements",
    "page_post_engagements",
    "pageConsumptions",
    "page_consumptions",
    "pageTotalActions",
    "page_total_actions",
    "postsCount",
    "reach",
    "impressions",
    "views",
    "websiteClicks",
    "profileVisits",
    "pageCtaClicks",
    "page_cta_clicks",
  ],
};

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

async function probeNetwork(blogId: string, network: string, fromIso: string, toIso: string): Promise<void> {
  const names = CANDIDATES[network] ?? [];
  console.log(`\n=== ${network.toUpperCase()} — ${blogId} ===`);

  // 1) /v2/analytics/timelines (subject=account) — where the box metrics live.
  console.log(`\n  /v2/analytics/timelines  (subject=account)`);
  let hitsTl = 0;
  for (const metric of names) {
    let r: GetResult;
    try {
      r = await mcGet("/v2/analytics/timelines", {
        from: fromIso,
        to: toIso,
        metric,
        network,
        subject: "account",
        timezone: timezone(),
      });
    } catch (err) {
      console.log(`    ✗ ${metric.padEnd(24)} (request failed: ${err instanceof Error ? err.message : "error"})`);
      continue;
    }
    if (!r.ok) continue; // invalid metric for this account — skip quietly
    const s = readTimeline(r.json, metric);
    if (s.sum === null) continue;
    hitsTl++;
    console.log(`    ✓ ${metric.padEnd(24)} sum=${fmt(s.sum).padStart(14)}   last=${fmt(s.last).padStart(12)}   (n=${s.n})`);
  }
  if (!hitsTl) console.log(`    (none of ${names.length} candidates returned data)`);

  // 2) /v2/analytics/aggregation (subject=account) — same names, aggregate form.
  console.log(`\n  /v2/analytics/aggregation  (subject=account)`);
  let hitsAgg = 0;
  for (const metric of names) {
    let r: GetResult;
    try {
      r = await mcGet("/v2/analytics/aggregation", {
        from: fromIso,
        to: toIso,
        metric,
        network,
        subject: "account",
        timezone: timezone(),
      });
    } catch {
      continue;
    }
    if (!r.ok) continue;
    const v = readAggregate(r.json);
    if (v === null) continue;
    hitsAgg++;
    console.log(`    ✓ ${metric.padEnd(24)} data=${fmt(v).padStart(14)}`);
  }
  if (!hitsAgg) console.log(`    (none of ${names.length} candidates returned data)`);
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
