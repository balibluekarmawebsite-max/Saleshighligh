import type { NextRequest } from "next/server";

import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { runMonthlySocialSync, type SocialUnit } from "@/lib/sales/social-monthly-sync";

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

const UNITS: SocialUnit[] = ["HOTEL", "RESTAURANT", "SPA"];

/**
 * Token-gated trigger to sync the monthly Social Media metrics from Metricool
 * into the Sales Highlight (Instagram / Facebook / TikTok / YouTube, whole-month
 * window, written as SocialMediaMetrics per business unit):
 *
 *   POST /api/sales/social/sync
 *   Authorization: Bearer <SALES_API_TOKEN | IMPORT_API_TOKEN>
 *   { "property": "BKDS", "period": "2026-10", "unit": "HOTEL" }   // unit optional (default HOTEL)
 *
 * Needs METRICOOL_USER_TOKEN / METRICOOL_USER_ID and a brand assigned for the
 * unit. A FINAL period is refused. Excluded from the auth middleware.
 */
export async function POST(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;
  if (!rateLimit(req, "api-sales-social-sync", 30, 60_000)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const unitRaw = String(b.unit ?? "HOTEL").toUpperCase();
  const unit = (UNITS as string[]).includes(unitRaw) ? (unitRaw as SocialUnit) : "HOTEL";

  const result = await runMonthlySocialSync({
    property: String(b.property ?? ""),
    period: String(b.period ?? ""),
    unit,
  });
  return Response.json(result.body, { status: result.status });
}
