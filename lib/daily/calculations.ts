/**
 * Pure, tested calculations for the Daily Report. Raw inputs come from the
 * `Daily*` tables; every derived metric is computed here (never stored).
 */

/** The minimum a cancellation line needs for the room-night calculation. */
export interface CancellationLike {
  cancelDate: string; // ISO yyyy-mm-dd
  createdDate: string; // ISO yyyy-mm-dd
  nights: number;
  roomQuantity: number;
}

/**
 * A same-day book-and-cancel — the reservation was cancelled on the same date it
 * was created. Per the daily report rule these are NOT counted (it's a wash, not
 * a real loss of on-the-books business).
 */
export function isSameDayCancellation(line: { cancelDate: string; createdDate: string }): boolean {
  return line.cancelDate === line.createdDate;
}

/** Room nights on one cancellation line = Night × Room Quantity. */
export function cancellationLineRoomNights(line: CancellationLike): number {
  return line.nights * line.roomQuantity;
}

/**
 * Counted cancellation room nights across lines — the sum of Night × Room
 * Quantity, EXCLUDING same-day book-and-cancel lines.
 */
export function cancellationRoomNights(lines: CancellationLike[]): number {
  return lines.reduce(
    (sum, l) => sum + (isSameDayCancellation(l) ? 0 : cancellationLineRoomNights(l)),
    0,
  );
}

/** Same-day book-and-cancel room nights (excluded from the report) — for info. */
export function sameDayCancellationRoomNights(lines: CancellationLike[]): number {
  return lines.reduce(
    (sum, l) => sum + (isSameDayCancellation(l) ? cancellationLineRoomNights(l) : 0),
    0,
  );
}

/** Counted cancellation room nights grouped by cancel date (same-day excluded). */
export function cancellationRoomNightsByDate(lines: CancellationLike[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const l of lines) {
    if (isSameDayCancellation(l)) continue;
    byDate.set(l.cancelDate, (byDate.get(l.cancelDate) ?? 0) + cancellationLineRoomNights(l));
  }
  return byDate;
}

// ---------------------------------------------------------------------------
// Occupancy Pickup — the daily "occupancy on hand" movement per stay month.
//
// The scraper posts the Yearly Occupancy export once a day; each day is a
// reading (snapshot) of the rooms on the books for every forward stay month.
// The Daily Report grid is those readings stacked day over day: one row per
// snapshot date, one column per stay month, the cell being occupancy on hand.
// The summary rows (Occ on Hand, Room Sold, Revenue, ADR) use the LATEST
// reading; Increasement % and Average Pickup/day describe the movement.
// ---------------------------------------------------------------------------

/** One daily reading for a single stay month (raw snapshot values). */
export interface PickupPoint {
  snapshotDate: string; // ISO yyyy-mm-dd — the day the reading was taken
  roomNights: number;
  saleableRooms: number | null;
  revenue: number | null;
}

/**
 * Occupancy on hand % = room nights ÷ saleable room nights × 100. Null when the
 * saleable denominator is missing or zero (so the report can show "—").
 */
export function occupancyPct(roomNights: number, saleableRooms: number | null): number | null {
  if (saleableRooms == null || saleableRooms <= 0) return null;
  return (roomNights / saleableRooms) * 100;
}

/** One cell of the movement series — a single day's reading with its occ %. */
export interface PickupSeriesPoint {
  snapshotDate: string;
  roomNights: number;
  revenue: number | null;
  occPct: number | null;
}

/** A stay month's full movement + the Daily Report's summary row for it. */
export interface StayMonthPickup {
  /** Readings oldest → newest (the column's cells, top to bottom). */
  series: PickupSeriesPoint[];
  /** Number of readings tracked (the divisor for Average Pickup/day). */
  days: number;
  /** Occ on Hand — the latest reading's occupancy %. */
  occOnHand: number | null;
  /** Room Sold — the latest reading's room nights. */
  roomSold: number;
  /** Revenue Nett — the latest reading's revenue. */
  revenue: number | null;
  /** ADR — latest revenue ÷ latest room sold. */
  adr: number | null;
  /** Increasement % — latest occ % minus the first reading's occ % (points). */
  increasementPct: number | null;
  /** Average Pickup/day — Increasement % ÷ number of readings. */
  avgPickupPerDay: number | null;
}

/**
 * Collapse a stay month's daily readings into its movement series + summary row.
 * Readings are sorted oldest → newest; the latest drives Occ on Hand / Room Sold
 * / Revenue / ADR, and first → latest drives Increasement % and Average
 * Pickup/day — matching the Daily Reservation Report's yellow summary rows.
 */
export function stayMonthPickup(points: PickupPoint[]): StayMonthPickup {
  const series: PickupSeriesPoint[] = [...points]
    .sort((a, b) => (a.snapshotDate < b.snapshotDate ? -1 : a.snapshotDate > b.snapshotDate ? 1 : 0))
    .map((p) => ({
      snapshotDate: p.snapshotDate,
      roomNights: p.roomNights,
      revenue: p.revenue,
      occPct: occupancyPct(p.roomNights, p.saleableRooms),
    }));

  const days = series.length;
  const latest = series[days - 1];
  const first = series[0];

  const roomSold = latest?.roomNights ?? 0;
  const revenue = latest?.revenue ?? null;
  const occOnHand = latest?.occPct ?? null;
  const adr = revenue != null && roomSold > 0 ? revenue / roomSold : null;
  const increasementPct =
    first?.occPct != null && latest?.occPct != null ? latest.occPct - first.occPct : null;
  const avgPickupPerDay = increasementPct != null && days > 0 ? increasementPct / days : null;

  return { series, days, occOnHand, roomSold, revenue, adr, increasementPct, avgPickupPerDay };
}
