/**
 * Pure aggregation of raw VHP "Reservation By Creation Date" line items into the
 * Daily Report's pickup-by-agent rows. Dependency-free (no prisma / next-auth)
 * so it is unit-testable and the single source of truth for the same-day
 * book-and-cancel exclusion.
 *
 * "Yesterday pick up" counts NEW reservations created on the report day, grouped
 * by booking agent (the "Reservation Name" column). A reservation that was
 * booked AND cancelled on the SAME day is a wash and is NOT counted — exactly
 * the rule the cancellation report already applies
 * (lib/daily/calculations.ts `isSameDayCancellation`). A reservation cancelled
 * on a LATER day still counts as pickup for the day it was created (it becomes a
 * cancellation on that later day's report).
 *
 * The scraper is an unvalidated JSON source, so every field is coerced
 * defensively: a malformed line (null, non-object, non-string name/date,
 * negative or implausibly large counts) is skipped, never thrown on — one bad
 * row must not fail the whole feed.
 */

import { isSameDayCancellation } from "@/lib/daily/calculations";

export interface RawPickupLine {
  /** Booking agent / source (VHP "Reservation Name"). `agent` is accepted too. */
  reservationName?: string | null;
  agent?: string | null;
  night?: number | string | null;
  roomQuantity?: number | string | null;
  /** ISO yyyy-mm-dd the booking was created (the report day). */
  createdDate?: string | null;
  /** ISO yyyy-mm-dd the booking was cancelled, or empty/absent if still active. */
  cancelDate?: string | null;
  /** Optional VHP status text (e.g. "Cancelled"); only read as a fallback. */
  status?: string | null;
  /** Explicit override when the scraper can't send dates but knows it's a wash. */
  sameDayCancelled?: boolean;
}

export interface AggregatedPickup {
  agent: string;
  roomNights: number;
  reservations: number;
}

export interface PickupAggregateResult {
  pickups: AggregatedPickup[];
  /** Lines dropped as same-day book-and-cancel (surfaced in the import response). */
  excludedLines: number;
  excludedRoomNights: number;
  /** Lines dropped as malformed / out-of-range (no agent, bad type, absurd RN). */
  skippedLines: number;
}

/**
 * A single reservation line can't realistically exceed this many room nights
 * (longest stay × largest group is a few thousand). A larger value is a corrupt
 * or misparsed number (e.g. an IDR amount read into a count) that would also
 * overflow the Postgres 32-bit `Int` column, so the line is skipped.
 */
const MAX_LINE_ROOM_NIGHTS = 100_000;

/** Night count: coerce anything to a non-negative integer (junk → 0). */
const toNights = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
};

/**
 * Room quantity: absent/blank → 1 (the VHP default), unparseable junk → 1, an
 * explicit number → that value clamped to ≥ 0 (so an explicit 0 stays 0, and a
 * negative never subtracts).
 */
const toQty = (v: unknown): number => {
  if (v == null || String(v).trim() === "") return 1;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 1;
};

const iso = (s: unknown): string => String(s ?? "").trim().slice(0, 10);

/** Agent label: part before the first comma, asterisks stripped, ws collapsed. */
function normAgent(s: unknown): string {
  return String(s ?? "")
    .split(",")[0]!
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when a reservation line is a same-day book-and-cancel (excluded from
 * pickup). Precise when both dates are present (created === cancelled); an
 * explicit `sameDayCancelled` flag is honoured when the scraper can't send
 * dates. A line cancelled on a LATER day is NOT same-day and still counts.
 */
export function isSameDayCancelledLine(line: RawPickupLine): boolean {
  if (line?.sameDayCancelled === true) return true;
  const createdDate = iso(line?.createdDate);
  const cancelDate = iso(line?.cancelDate);
  if (!createdDate || !cancelDate) return false;
  return isSameDayCancellation({ createdDate, cancelDate });
}

/**
 * Aggregate raw reservation lines into pickup-by-agent rows, EXCLUDING same-day
 * book-and-cancel lines. Room nights = Night × Room Quantity (Quantity defaults
 * to 1 when absent). Malformed / out-of-range lines are skipped (never thrown
 * on). Rows are summed by normalised agent and sorted by room nights, desc.
 */
export function aggregatePickups(lines: RawPickupLine[]): PickupAggregateResult {
  const agg = new Map<string, { agent: string; rn: number; count: number }>();
  let excludedLines = 0;
  let excludedRoomNights = 0;
  let skippedLines = 0;

  for (const line of Array.isArray(lines) ? lines : []) {
    // Defensive: a null / non-object element (e.g. a scraper placeholder for a
    // row it failed to parse) is dropped, not fatal.
    if (!line || typeof line !== "object") {
      skippedLines += 1;
      continue;
    }

    const rn = toNights(line.night) * toQty(line.roomQuantity);

    // Same-day book-and-cancel: a wash — not counted.
    if (isSameDayCancelledLine(line)) {
      excludedLines += 1;
      excludedRoomNights += rn;
      continue;
    }

    // Corrupt / misparsed magnitude that would overflow the Int column.
    if (rn > MAX_LINE_ROOM_NIGHTS) {
      skippedLines += 1;
      continue;
    }

    const agent = normAgent(line.reservationName || line.agent);
    if (!agent) {
      skippedLines += 1;
      continue;
    }

    const key = agent.toLowerCase();
    const cur = agg.get(key) ?? { agent, rn: 0, count: 0 };
    cur.rn += rn;
    cur.count += 1;
    agg.set(key, cur);
  }

  const pickups = [...agg.values()]
    .map((v) => ({ agent: v.agent, roomNights: v.rn, reservations: v.count }))
    .sort((a, b) => b.roomNights - a.roomNights);

  return { pickups, excludedLines, excludedRoomNights, skippedLines };
}
