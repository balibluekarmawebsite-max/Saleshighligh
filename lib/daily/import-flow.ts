/**
 * Ingestion for the two reservation-flow feeds of the Daily Report:
 *   - Reservation  (/api/daily/reservation): new-reservation pickup by agent +
 *     arrivals per stay date.
 *   - Room Departure (/api/daily/departure): departures per stay date.
 *
 * Both take a structured JSON body (the scraper extracts the figures from the
 * VHP page and posts clean numbers — no CSV format to guess). Writes are
 * idempotent: a pickup date replaces that day's agent rows; an arrival/departure
 * date upserts only its own column, so the two feeds never clobber each other.
 */

import { logAudit } from "@/lib/audit";
import { isoToUtcDate, isValidIsoDate, yesterdayWitaIso } from "@/lib/daily/date";
import { prisma } from "@/lib/prisma";

const str = (v: unknown): string => String(v ?? "").trim();
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
};

export interface DayRooms {
  date: string; // yyyy-mm-dd
  rooms: number;
}
export interface AgentPickup {
  agent: string;
  roomNights: number;
  reservations?: number | null;
}

export interface FlowResult {
  status: number;
  body:
    | { ok: true; property: string; [k: string]: unknown }
    | { ok: false; error: string };
}

const fail = (status: number, error: string): FlowResult => ({ status, body: { ok: false, error } });

async function resolveProperty(code: string): Promise<{ id: string } | null> {
  if (!code) return null;
  return prisma.property.findUnique({ where: { code: code.trim().toUpperCase() }, select: { id: true } });
}

/** Upsert arrival or departure room counts for a set of stay dates. */
async function upsertFlow(
  propertyId: string,
  days: DayRooms[],
  field: "arrivalRooms" | "departureRooms",
): Promise<number> {
  let written = 0;
  for (const d of days) {
    const iso = str(d.date);
    const rooms = int(d.rooms);
    if (!isValidIsoDate(iso) || rooms == null || rooms < 0) continue;
    const stayDate = isoToUtcDate(iso);
    await prisma.dailyArrivalDeparture.upsert({
      where: { propertyId_stayDate: { propertyId, stayDate } },
      create: { propertyId, stayDate, [field]: rooms },
      update: { [field]: rooms },
    });
    written += 1;
  }
  return written;
}

export interface ReservationImportInput {
  property: string;
  /** Business day the new reservations were entered; defaults to yesterday WITA. */
  date?: string;
  pickups?: AgentPickup[];
  arrivals?: DayRooms[];
  source?: string;
}

/** Store the Reservation feed: pickup-by-agent (replace-all) + arrivals (upsert). */
export async function runReservationImport(input: ReservationImportInput): Promise<FlowResult> {
  try {
    const prop = await resolveProperty(input.property);
    if (!prop) return fail(400, `unknown property "${str(input.property)}".`);

    const date = str(input.date) || yesterdayWitaIso();
    if (!isValidIsoDate(date)) return fail(400, "date must be a real calendar date in yyyy-mm-dd form.");
    const pickupDate = isoToUtcDate(date);

    const pickups = (Array.isArray(input.pickups) ? input.pickups : [])
      .map((p) => ({ agent: str(p.agent), roomNights: int(p.roomNights), reservations: int(p.reservations) }))
      .filter((p): p is { agent: string; roomNights: number; reservations: number | null } =>
        p.agent !== "" && p.roomNights != null && p.roomNights >= 0);

    // Replace-all the day's pickup rows (deduped by agent, last wins).
    const byAgent = new Map<string, { agent: string; roomNights: number; reservations: number | null }>();
    for (const p of pickups) byAgent.set(p.agent.toLowerCase(), p);
    const rows = [...byAgent.values()];

    await prisma.$transaction(async (tx) => {
      await tx.dailyReservationPickup.deleteMany({ where: { propertyId: prop.id, pickupDate } });
      if (rows.length) {
        await tx.dailyReservationPickup.createMany({
          data: rows.map((p) => ({
            propertyId: prop.id,
            pickupDate,
            agent: p.agent,
            roomNights: p.roomNights,
            reservations: p.reservations,
          })),
        });
      }
    });

    const arrivalsWritten = await upsertFlow(prop.id, Array.isArray(input.arrivals) ? input.arrivals : [], "arrivalRooms");

    await logAudit("daily_reservation_import", str(input.property).toUpperCase(), {
      date,
      pickups: rows.length,
      arrivals: arrivalsWritten,
      source: input.source ?? null,
    }).catch(() => {});

    return {
      status: 200,
      body: {
        ok: true,
        property: str(input.property).toUpperCase(),
        date,
        pickupAgents: rows.length,
        pickupRoomNights: rows.reduce((s, p) => s + p.roomNights, 0),
        arrivalsWritten,
        message: `Reservation feed stored — ${rows.length} agent(s), ${arrivalsWritten} arrival day(s).`,
      },
    };
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : "reservation import failed.");
  }
}

export interface DepartureImportInput {
  property: string;
  date?: string;
  departures?: DayRooms[];
  source?: string;
}

/** Store the Room Departure feed: departures per stay date (upsert). */
export async function runDepartureImport(input: DepartureImportInput): Promise<FlowResult> {
  try {
    const prop = await resolveProperty(input.property);
    if (!prop) return fail(400, `unknown property "${str(input.property)}".`);

    const days = Array.isArray(input.departures) ? input.departures : [];
    if (days.length === 0) return fail(400, "departures[] is required (each {date, rooms}).");

    const written = await upsertFlow(prop.id, days, "departureRooms");
    if (written === 0) return fail(422, "no valid departure rows found.");

    await logAudit("daily_departure_import", str(input.property).toUpperCase(), {
      departures: written,
      source: input.source ?? null,
    }).catch(() => {});

    return {
      status: 200,
      body: {
        ok: true,
        property: str(input.property).toUpperCase(),
        departuresWritten: written,
        message: `Room Departure feed stored — ${written} day(s).`,
      },
    };
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : "departure import failed.");
  }
}
