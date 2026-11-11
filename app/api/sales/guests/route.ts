import type { NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { parseArrivalGuestCsv } from "@/lib/sales/arrival-guest-csv";
import { runGuestArrivalsImport } from "@/lib/sales/guest-arrivals-import";
import type { RawArrival } from "@/lib/sales/guest-arrivals-logic";

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
    { ok: false, error: "invalid token", scheme: header ? header.split(/\s+/)[0] || "none" : "none", sentTokenLength: sent.length },
    { status: 401 },
  );
}

/**
 * Token-gated RAW push for the Sales Highlight "Guests, Geography & Length of
 * Stay" section, scraped from VHP's Arrival Guest report
 * (https://e1-vhp.com/fr/report/arrival-guest). The server COMPILES the raw
 * arrivals into nationality room-nights + a LOS distribution:
 *
 *   Authorization: Bearer <SALES_API_TOKEN | IMPORT_API_TOKEN>
 *   Content-Type: application/json
 *   {
 *     "property": "BKDS",
 *     "period": "2026-06",
 *     "scope": "MTD",                       // MTD (default) | YTD
 *     "arrivals": [
 *       { "country": "Australia", "arrival": "2026-06-01", "departure": "2026-06-05", "rooms": 1, "guests": 2 },
 *       { "country": "FR", "nights": 3, "guests": 2 }
 *     ],
 *     "lastYearArrivals": [ ... ],          // optional, same window a year earlier (VS LY)
 *     "source": "vhp:arrival-guest"
 *   }
 *
 * Each row needs a country (name or ISO alpha-2) and either arrival+departure or
 * an explicit nights value. `rooms` (default 1) and `guests` are optional. The
 * push REPLACES that period's nationality rows for the given scope; LOS is
 * (re)built from the MTD push. A FINAL period is refused. Excluded from auth
 * middleware.
 */
export async function POST(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;
  if (!rateLimit(req, "api-sales-guests", 60, 60_000)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;

  // Accept either compiled JSON `arrivals[]` or the raw VHP CSV text (`csv`),
  // which the server parses. The CSV also carries the period + property, used
  // when the caller doesn't send them explicitly.
  let property = String(b.property ?? "");
  let period = String(b.period ?? "");
  let arrivals: RawArrival[] = Array.isArray(b.arrivals) ? (b.arrivals as RawArrival[]) : [];
  let lastYearArrivals: RawArrival[] | undefined = Array.isArray(b.lastYearArrivals)
    ? (b.lastYearArrivals as RawArrival[])
    : undefined;

  if (typeof b.csv === "string" && b.csv.trim()) {
    const parsed = parseArrivalGuestCsv(b.csv);
    arrivals = parsed.arrivals;
    if (!period && parsed.meta.periodHint) period = parsed.meta.periodHint;
    if (!property && parsed.meta.propertyHint) property = parsed.meta.propertyHint;
  }
  const lastYearProvided =
    (typeof b.lastYearCsv === "string" && b.lastYearCsv.trim().length > 0) ||
    (Array.isArray(b.lastYearArrivals) && b.lastYearArrivals.length > 0);
  if (typeof b.lastYearCsv === "string" && b.lastYearCsv.trim()) {
    lastYearArrivals = parseArrivalGuestCsv(b.lastYearCsv).arrivals;
  }

  const result = await runGuestArrivalsImport({
    property,
    period,
    scope: b.scope ? String(b.scope) : undefined,
    arrivals,
    lastYearArrivals,
    lastYearProvided,
    source: b.source ? String(b.source) : undefined,
  });
  return Response.json(result.body, { status: result.status });
}

/** Verify what landed: GET ?property=BKDS&period=2026-06&scope=MTD (same token). */
export async function GET(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("property") ?? "").trim().toUpperCase();
  const period = (searchParams.get("period") ?? "").trim();
  const scopeRaw = (searchParams.get("scope") ?? "MTD").trim().toUpperCase();
  const scope = scopeRaw === "YTD" ? "YTD" : "MTD";
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
  if (!rp) return Response.json({ ok: true, property: code, period, scope, status: null, nationalities: [], lengthOfStay: [] });

  const [nat, los] = await Promise.all([
    prisma.nationalityProduction.findMany({
      where: { periodId: rp.id, scope },
      orderBy: { roomNights: "desc" },
      select: { countryCode: true, countryName: true, roomNights: true, guests: true, roomNightsLastYear: true },
    }),
    prisma.lengthOfStay.findMany({
      where: { periodId: rp.id },
      select: { losBucket: true, bookings: true, roomNights: true, lastYearRoomNights: true },
    }),
  ]);
  return Response.json({ ok: true, property: code, period, scope, status: rp.status, nationalities: nat, lengthOfStay: los });
}
