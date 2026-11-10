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
import { clampDailyDateIso, isoToUtcDate, isValidIsoDate, witaDateIso } from "@/lib/daily/date";
import { aggregatePickups, type RawPickupLine } from "@/lib/daily/pickup-aggregate";
import { prisma } from "@/lib/prisma";

const str = (v: unknown): string => String(v ?? "").trim();
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
};

export interface DayRooms {
  date: string; // yyyy-mm-dd
  rooms: number;
  /** "Expected room occupied" for this stay date (optional). */
  occupied?: number | null;
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
    // "Expected room occupied" rides along on the day row when present; only
    // written when given, so it never nulls out a value the other feed set.
    const occ = int(d.occupied);
    const occFields = occ != null && occ >= 0 ? { occupiedRooms: occ } : {};
    await prisma.dailyArrivalDeparture.upsert({
      where: { propertyId_stayDate: { propertyId, stayDate } },
      create: { propertyId, stayDate, [field]: rooms, ...occFields },
      update: { [field]: rooms, ...occFields },
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
  /**
   * Raw "Reservation By Creation Date" line items (preferred). When present the
   * dashboard aggregates them by agent and EXCLUDES same-day book-and-cancel
   * reservations, so `pickups` is ignored. Falls back to `pickups` when absent.
   */
  pickupLines?: RawPickupLine[];
  arrivals?: DayRooms[];
  source?: string;
}

/** Store the Reservation feed: pickup-by-agent (replace-all) + arrivals (upsert). */
export async function runReservationImport(input: ReservationImportInput): Promise<FlowResult> {
  try {
    const prop = await resolveProperty(input.property);
    if (!prop) return fail(400, `unknown property "${str(input.property)}".`);

    // One clock read drives both the clamp and the prune decision.
    const nowMs = Date.now();
    const rawDate = str(input.date) || witaDateIso(nowMs, -1);
    if (!isValidIsoDate(rawDate)) return fail(400, "date must be a real calendar date in yyyy-mm-dd form.");
    // Normalise like the occupancy feed: pickup for "today" (or a future date)
    // really means yesterday's new reservations, so store it under yesterday.
    const date = clampDailyDateIso(rawDate, nowMs);
    const pickupDate = isoToUtcDate(date);
    const pruneFuturePickup = date === witaDateIso(nowMs, -1);

    // Prefer raw reservation lines: aggregate by agent and drop same-day
    // book-and-cancel reservations (a wash — not counted, per the daily report
    // rule). Fall back to the pre-aggregated `pickups` for backward compat.
    let excludedSameDay = 0;
    let excludedSameDayRoomNights = 0;
    let skippedInvalid = 0;
    let suppliedPickupInput = false;
    let sourcePickups: AgentPickup[];
    if (Array.isArray(input.pickupLines) && input.pickupLines.length > 0) {
      suppliedPickupInput = true;
      const agg = aggregatePickups(input.pickupLines);
      excludedSameDay = agg.excludedLines;
      excludedSameDayRoomNights = agg.excludedRoomNights;
      skippedInvalid = agg.skippedLines;
      sourcePickups = agg.pickups;
    } else {
      sourcePickups = Array.isArray(input.pickups) ? input.pickups : [];
      suppliedPickupInput = sourcePickups.length > 0;
    }

    const pickups = sourcePickups
      .map((p) => ({ agent: str(p.agent), roomNights: int(p.roomNights), reservations: int(p.reservations) }))
      .filter((p): p is { agent: string; roomNights: number; reservations: number | null } =>
        p.agent !== "" && p.roomNights != null && p.roomNights >= 0);

    // Replace-all the day's pickup rows (deduped by agent, last wins).
    const byAgent = new Map<string, { agent: string; roomNights: number; reservations: number | null }>();
    for (const p of pickups) byAgent.set(p.agent.toLowerCase(), p);
    const rows = [...byAgent.values()];

    // Only replace the day's pickup rows when there is something to store.
    // Guard against wiping good data on a suspect pull: an arrivals-only push
    // (no pickup input), or a broken/partial re-pull that aggregated to zero
    // (e.g. every line excluded as a same-day cancel), must NOT delete the real
    // pickup already recorded for the day. This mirrors the broken-pull guard
    // the sibling occupancy-snapshot feed has.
    const keptExistingPickup = suppliedPickupInput && rows.length === 0;
    if (rows.length > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.dailyReservationPickup.deleteMany({ where: { propertyId: prop.id, pickupDate } });
        if (pruneFuturePickup) {
          // Clear any stray future/today pickup rows a previous mis-stamped push
          // left behind (gt — same-date rows are replaced above, not here).
          await tx.dailyReservationPickup.deleteMany({
            where: { propertyId: prop.id, pickupDate: { gt: pickupDate } },
          });
        }
        await tx.dailyReservationPickup.createMany({
          data: rows.map((p) => ({
            propertyId: prop.id,
            pickupDate,
            agent: p.agent,
            roomNights: p.roomNights,
            reservations: p.reservations,
          })),
        });
      });
    } else if (pruneFuturePickup) {
      // No pickup rows to store (arrivals-only, or every line a same-day wash),
      // but a live push dated yesterday can still safely clear a stray
      // future/today pickup row a mis-stamped push left behind — so the detail
      // view never surfaces pickup a day ahead of the occupancy anchor. The
      // current day's real rows are untouched (gt only), so a suspect zero pull
      // still can't wipe good data.
      await prisma.dailyReservationPickup.deleteMany({
        where: { propertyId: prop.id, pickupDate: { gt: pickupDate } },
      });
    }

    const arrivalsWritten = await upsertFlow(prop.id, Array.isArray(input.arrivals) ? input.arrivals : [], "arrivalRooms");

    await logAudit("daily_reservation_import", str(input.property).toUpperCase(), {
      date,
      pickups: rows.length,
      arrivals: arrivalsWritten,
      excludedSameDay,
      excludedSameDayRoomNights,
      skippedInvalid,
      keptExistingPickup,
      source: input.source ?? null,
    }).catch(() => {});

    const notes = [
      excludedSameDay > 0 ? `excluded ${excludedSameDay} same-day cancel (${excludedSameDayRoomNights} RN)` : "",
      skippedInvalid > 0 ? `skipped ${skippedInvalid} invalid line(s)` : "",
      keptExistingPickup ? "no net pickup — kept existing rows" : "",
    ].filter(Boolean);
    const note = notes.length ? ` (${notes.join("; ")})` : "";
    return {
      status: 200,
      body: {
        ok: true,
        property: str(input.property).toUpperCase(),
        date,
        pickupAgents: rows.length,
        pickupRoomNights: rows.reduce((s, p) => s + p.roomNights, 0),
        excludedSameDay,
        excludedSameDayRoomNights,
        skippedInvalid,
        arrivalsWritten,
        message: `Reservation feed stored — ${rows.length} agent(s), ${arrivalsWritten} arrival day(s)${note}.`,
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
