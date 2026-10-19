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
