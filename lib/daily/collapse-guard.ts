/**
 * Guard against a BROKEN / EMPTY pickup pull overwriting good data.
 *
 * Occupancy on hand for a stay month accumulates over time — it climbs as
 * bookings come in and only ever dips a little from the odd cancellation. It
 * physically cannot collapse from, say, 81% to 1% overnight. So when a new pull
 * shows several months cratering versus the previous reading, the export is
 * broken (empty / wrong / partial), not real movement — reject it before it
 * replaces the day's good numbers (which poisons Occ on Hand / Room Sold /
 * Revenue / ADR, since those use the latest reading).
 *
 * Pure and dependency-light (only the shared occupancy formula) so it's
 * unit-testable. Deliberately conservative: a month only "collapses" when it
 * had real occupancy before AND the new reading fell to a small fraction of it
 * AND by a large absolute amount — and it takes SEVERAL such months to reject,
 * so a genuine single-month group cancellation never trips it.
 */

import { occupancyPct } from "@/lib/daily/calculations";

export interface OccReading {
  stayYear: number;
  stayMonth: number; // 1-12
  roomNights: number;
  saleableRooms: number | null;
}

/** The prior month must have had at least this occupancy to be worth checking. */
const MIN_PRIOR_OCC = 25;
/** The new reading must be ≤ this fraction of the prior to count as a collapse. */
const COLLAPSE_RATIO = 0.25;
/** …and must have dropped by at least this many occupancy points. */
const MIN_DROP_POINTS = 20;
/** Reject only when at least this many months collapse at once (≥2 = systemic). */
const MIN_COLLAPSED_MONTHS = 2;

const key = (r: { stayYear: number; stayMonth: number }) =>
  `${r.stayYear}-${String(r.stayMonth).padStart(2, "0")}`;

/**
 * Returns a rejection message when the new readings look like a broken export
 * compared with the most recent prior snapshot, else null. Skips silently when
 * there's no prior data or the prior itself had nothing meaningful (so a report
 * can always recover from an earlier bad state).
 */
export function occupancyCollapseError(
  newRows: OccReading[],
  priorRows: OccReading[],
): string | null {
  if (priorRows.length === 0) return null;
  const prior = new Map(priorRows.map((r) => [key(r), r]));

  const collapsed: { month: string; from: number; to: number }[] = [];
  for (const n of newRows) {
    const p = prior.get(key(n));
    if (!p) continue;
    const priorOcc = occupancyPct(p.roomNights, p.saleableRooms);
    const nowOcc = occupancyPct(n.roomNights, n.saleableRooms);
    if (priorOcc == null || nowOcc == null) continue;
    if (priorOcc < MIN_PRIOR_OCC) continue; // nothing meaningful to lose
    if (nowOcc <= priorOcc * COLLAPSE_RATIO && priorOcc - nowOcc >= MIN_DROP_POINTS) {
      collapsed.push({ month: key(n), from: priorOcc, to: nowOcc });
    }
  }

  if (collapsed.length < MIN_COLLAPSED_MONTHS) return null;

  const sample = collapsed
    .slice(0, 3)
    .map((c) => `${c.month} ${c.from.toFixed(1)}%→${c.to.toFixed(1)}%`)
    .join(", ");
  return (
    `Rejected: occupancy on hand collapsed for ${collapsed.length} month(s) ` +
    `(${sample}) versus the previous reading — this looks like a broken or empty ` +
    `export, so it was not stored. Re-pull and push a complete file.`
  );
}
