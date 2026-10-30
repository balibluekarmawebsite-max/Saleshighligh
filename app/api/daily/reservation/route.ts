import type { NextRequest } from "next/server";

import { runReservationImport } from "@/lib/daily/import-flow";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** Shared-secret bearer check (same token as the other daily feeds). */
function checkToken(req: NextRequest): Response | null {
  const token = process.env.IMPORT_API_TOKEN;
  if (!token) {
    return Response.json(
      { ok: false, error: "IMPORT_API_TOKEN is not set on the server — refusing to accept pushes." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ ok: false, error: "invalid token" }, { status: 401 });
  }
  return null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Token-gated JSON push for the Daily Report's "Reservation" feed (from VHP
 * https://e1-vhp.com/fr/reservation). The scraper extracts the figures and POSTs:
 *
 *   Authorization: Bearer <IMPORT_API_TOKEN>
 *   Content-Type: application/json
 *   {
 *     "property": "BKV",
 *     "date": "2026-10-29",          // business day the bookings were entered (optional; defaults to yesterday WITA)
 *     "pickups": [                     // NEW reservations entered on `date`, by agent
 *       { "agent": "Booking.com", "roomNights": 16, "reservations": 6 },
 *       { "agent": "G2 Travel",   "roomNights": 5,  "reservations": 2 }
 *     ],
 *     "arrivals": [                    // arrivals by stay date (prev / today / tomorrow)
 *       { "date": "2026-10-29", "rooms": 2 },
 *       { "date": "2026-10-30", "rooms": 7 },
 *       { "date": "2026-10-31", "rooms": 5 }
 *     ]
 *   }
 *
 * Idempotent: `date`'s pickup rows are replaced; each arrival date is upserted.
 * Excluded from the auth middleware so the token request isn't redirected to /login.
 */
export async function POST(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;
  if (!rateLimit(req, "api-daily-reservation", 60, 60_000)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  if (!b.property) return Response.json({ ok: false, error: "property is required." }, { status: 400 });

  // The scraper sends `snapshotDate` (the run date); `date` is accepted as an alias.
  const runDate = b.snapshotDate ?? b.date;
  const result = await runReservationImport({
    property: String(b.property),
    date: runDate ? String(runDate) : undefined,
    pickups: Array.isArray(b.pickups) ? (b.pickups as never[]) : [],
    arrivals: Array.isArray(b.arrivals) ? (b.arrivals as never[]) : [],
    source: b.source ? String(b.source) : undefined,
  });
  return Response.json(result.body, { status: result.status });
}

/** Verify what landed: GET ?property=BKV[&date=2026-10-29]. */
export async function GET(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;
  const { searchParams } = new URL(req.url);
  const code = (searchParams.get("property") ?? "").trim().toUpperCase();
  if (!code) return Response.json({ ok: false, error: "property query param is required." }, { status: 400 });

  const prop = await prisma.property.findUnique({ where: { code }, select: { id: true } });
  if (!prop) return Response.json({ ok: false, error: `unknown property "${code}".` }, { status: 400 });

  const dateParam = searchParams.get("date");
  const where: { propertyId: string; pickupDate?: Date } = { propertyId: prop.id };
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    where.pickupDate = new Date(`${dateParam}T00:00:00.000Z`);
  }
  const pickups = await prisma.dailyReservationPickup.findMany({
    where,
    orderBy: [{ pickupDate: "desc" }, { roomNights: "desc" }],
    take: 100,
    select: { pickupDate: true, agent: true, roomNights: true, reservations: true },
  });
  const arrivals = await prisma.dailyArrivalDeparture.findMany({
    where: { propertyId: prop.id },
    orderBy: { stayDate: "desc" },
    take: 30,
    select: { stayDate: true, arrivalRooms: true, departureRooms: true },
  });
  return Response.json({
    ok: true,
    property: code,
    pickups: pickups.map((p) => ({ ...p, pickupDate: p.pickupDate.toISOString().slice(0, 10) })),
    arrivalDepartures: arrivals.map((a) => ({ ...a, stayDate: a.stayDate.toISOString().slice(0, 10) })),
  });
}
