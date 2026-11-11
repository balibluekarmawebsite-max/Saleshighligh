import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { runRoomTypeImport } from "@/lib/sales/room-type-import";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
 * Token-gated JSON push for the Sales Highlight "Room Types" section, scraped
 * from VHP's Forecast Room by Room Type report
 * (https://e1-vhp.com/fr/report/forecast-room-by-room-type) for the report month:
 *
 *   Authorization: Bearer <SALES_API_TOKEN | IMPORT_API_TOKEN>
 *   Content-Type: application/json
 *   {
 *     "property": "BKDS",
 *     "period": "2026-06",
 *     "roomTypes": [
 *       { "roomType": "Deluxe Room",  "roomNights": 210, "adr": 1650000, "revenue": 346500000 },
 *       { "roomType": "Premier Suite","roomNights": 120, "adr": 2100000, "revenue": 252000000 }
 *     ],
 *     "source": "vhp:forecast-room-by-room-type"
 *   }
 *
 * `adr` is optional (the dashboard derives revenue ÷ room-nights). The push
 * REPLACES that period's room-type rows (idempotent), actuals only — no budget —
 * and creates the period as DRAFT if it doesn't exist. A FINAL period is refused.
 * Excluded from the auth middleware.
 */
export async function POST(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;
  if (!rateLimit(req, "api-sales-room-types", 60, 60_000)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const result = await runRoomTypeImport({
    property: String(b.property ?? ""),
    period: String(b.period ?? ""),
    roomTypes: Array.isArray(b.roomTypes) ? (b.roomTypes as never[]) : [],
    source: b.source ? String(b.source) : undefined,
  });
  return Response.json(result.body, { status: result.status });
}

/** Verify what landed: GET ?property=BKDS&period=2026-06 (same bearer token). */
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
  if (!rp) return Response.json({ ok: true, property: code, period, status: null, roomTypes: [] });

  const rows = await prisma.roomTypeProduction.findMany({
    where: { periodId: rp.id },
    orderBy: { revenueActual: "desc" },
    select: { roomTypeName: true, roomNightsActual: true, adrActual: true, revenueActual: true },
  });
  return Response.json({
    ok: true,
    property: code,
    period,
    status: rp.status,
    roomTypes: rows.map((r) => ({
      roomType: r.roomTypeName,
      roomNights: r.roomNightsActual,
      adr: Number(r.adrActual),
      revenue: Number(r.revenueActual),
    })),
  });
}
