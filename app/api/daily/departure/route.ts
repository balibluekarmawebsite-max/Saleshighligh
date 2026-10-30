import type { NextRequest } from "next/server";

import { runDepartureImport } from "@/lib/daily/import-flow";
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
 * Token-gated JSON push for the Daily Report's "Room Departure" feed (from VHP
 * https://e1-vhp.com/to/telephone-operator). The scraper POSTs departure room
 * counts per stay date:
 *
 *   Authorization: Bearer <IMPORT_API_TOKEN>
 *   Content-Type: application/json
 *   {
 *     "property": "BKV",
 *     "departures": [
 *       { "date": "2026-10-29", "rooms": 3 },
 *       { "date": "2026-10-30", "rooms": 7 },
 *       { "date": "2026-10-31", "rooms": 4 }
 *     ]
 *   }
 *
 * Each date upserts the departure column of daily_arrival_departures, so it never
 * clobbers the arrivals the Reservation feed wrote. Excluded from the auth
 * middleware so the token request isn't redirected to /login.
 */
export async function POST(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;
  if (!rateLimit(req, "api-daily-departure", 60, 60_000)) return tooManyRequests();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body." }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  if (!b.property) return Response.json({ ok: false, error: "property is required." }, { status: 400 });

  const result = await runDepartureImport({
    property: String(b.property),
    date: b.date ? String(b.date) : undefined,
    departures: Array.isArray(b.departures) ? (b.departures as never[]) : [],
    source: b.source ? String(b.source) : undefined,
  });
  return Response.json(result.body, { status: result.status });
}
