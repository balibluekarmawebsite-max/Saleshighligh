import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { runAccountProductionImport } from "@/lib/sales/account-production-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Shared-secret bearer check for the monthly Sales Highlight feeds. Accepts a
 * dedicated SALES_API_TOKEN (its own identity for these report pulls) or the
 * existing IMPORT_API_TOKEN the VHP scraper already uses. Fails closed when
 * neither is set. On a 401 it echoes only NON-SENSITIVE diagnostics about the
 * caller's own request (scheme + token length), never the server secret.
 */
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
  return Response.json(
    {
      ok: false,
      error: "invalid token",
      scheme: header ? header.split(/\s+/)[0] || "none" : "none",
      sentTokenLength: sent.length,
    },
    { status: 401 },
  );
}

/**
 * Token-gated JSON push for the Sales Highlight "Account Production (YTD)"
 * section, scraped from VHP's Forecast Room Production report
 * (https://e1-vhp.com/fr/report/forecast-room-production) year-to-date:
 *
 *   Authorization: Bearer <SALES_API_TOKEN | IMPORT_API_TOKEN>
 *   Content-Type: application/json
 *   {
 *     "property": "BKDS",
 *     "period": "2026-10",          // report month; data is YTD (Jan..Oct 2026)
 *     "accounts": [
 *       { "account": "Booking.com", "type": "OTA", "roomNights": 1480, "revenue": 2701269602 },
 *       { "account": "Expedia",     "type": "OTA", "roomNights": 187,  "revenue": 304408058 }
 *     ],
 *     "source": "vhp:forecast-room-production"   // optional
 *   }
 *
 * `type` is optional (OTA | TA/"Travel Agent" | CORPORATE | WHOLESALER); when
 * absent the dashboard classifies by name. The push REPLACES that period's
 * account rows (idempotent) and creates the period as DRAFT if it doesn't exist.
 * A FINAL period is refused. Excluded from the auth middleware so the token
 * request isn't redirected to /login.
 */
export async function POST(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;
  if (!rateLimit(req, "api-sales-accounts", 60, 60_000)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const result = await runAccountProductionImport({
    property: String(b.property ?? ""),
    period: String(b.period ?? ""),
    accounts: Array.isArray(b.accounts) ? (b.accounts as never[]) : [],
    source: b.source ? String(b.source) : undefined,
  });
  return Response.json(result.body, { status: result.status });
}

/**
 * Verify what landed: GET ?property=BKDS&period=2026-10 (same bearer token).
 * Returns the stored account rows (newest-first by revenue) so a push can be
 * confirmed.
 */
export async function GET(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("property") ?? "").trim().toUpperCase();
  const period = (searchParams.get("period") ?? "").trim();
  if (!code || !/^\d{4}-\d{2}$/.test(period)) {
    return Response.json({ ok: false, error: "property and period=YYYY-MM are required." }, { status: 400 });
  }

  const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
  if (!property) return Response.json({ ok: false, error: `unknown property "${code}".` }, { status: 400 });

  const date = new Date(`${period}-01T00:00:00.000Z`);
  const rp = await prisma.reportPeriod.findUnique({
    where: { propertyId_period: { propertyId: property.id, period: date } },
    select: { id: true, status: true },
  });
  if (!rp) return Response.json({ ok: true, property: code, period, status: null, accounts: [] });

  const rows = await prisma.accountProduction.findMany({
    where: { periodId: rp.id },
    orderBy: { revenue: "desc" },
    select: { accountName: true, accountType: true, roomNights: true, revenue: true },
  });
  return Response.json({
    ok: true,
    property: code,
    period,
    status: rp.status,
    accounts: rows.map((r) => ({ ...r, revenue: Number(r.revenue) })),
  });
}
