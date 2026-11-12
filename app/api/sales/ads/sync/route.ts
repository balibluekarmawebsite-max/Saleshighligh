import type { NextRequest } from "next/server";

import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { runMonthlyAdsSync } from "@/lib/sales/ads-monthly-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Shared-secret bearer check: SALES_API_TOKEN or the existing IMPORT_API_TOKEN. */
function checkToken(req: NextRequest): Response | null {
  const sales = (process.env.SALES_API_TOKEN ?? "").trim();
  const importTok = (process.env.IMPORT_API_TOKEN ?? "").trim();
  if (!sales && !importTok) {
    return Response.json(
      { ok: false, error: "No token configured — set SALES_API_TOKEN or IMPORT_API_TOKEN on the server." },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const sent = (header.match(/^Bearer\s+(.*)$/i)?.[1] ?? "").trim();
  if ((sales && sent === sales) || (importTok && sent === importTok)) return null;
  return Response.json({ ok: false, error: "invalid token" }, { status: 401 });
}

/**
 * Token-gated trigger to sync the monthly Digital Ads & ROAS figures from the
 * ads dashboard API into the Sales Highlight (same source as the weekly report,
 * monthly window):
 *
 *   POST /api/sales/ads/sync
 *   Authorization: Bearer <SALES_API_TOKEN | IMPORT_API_TOKEN>
 *   { "property": "BKDS", "period": "2026-10" }
 *
 * Pulls Google/Meta spend · impressions · clicks · reach · conversion value for
 * the whole month and upserts AdsPerformance (unit HOTEL). Needs ADS_API_KEY on
 * the server. A FINAL period is refused. Excluded from the auth middleware.
 */
export async function POST(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;
  if (!rateLimit(req, "api-sales-ads-sync", 30, 60_000)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const result = await runMonthlyAdsSync({
    property: String(b.property ?? ""),
    period: String(b.period ?? ""),
  });
  return Response.json(result.body, { status: result.status });
}
