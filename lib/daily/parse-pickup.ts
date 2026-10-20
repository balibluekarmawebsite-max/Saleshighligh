/**
 * Deterministic parser for the VHP "Yearly Forecast Of Room Occupancy" export,
 * captured DAILY as an occupancy-pickup snapshot (feed `PICKUP`).
 *
 * The same export drives weekly Section B (lib/weekly/import/vhp-parse.ts), but
 * there we keep only the report-year months. For the daily report's
 * occupancy-on-hand matrix we keep ALL forward stay-months — each day's push
 * records how the rooms (and revenue) on the books for every future month have
 * grown. One row per (stayYear, stayMonth) for the snapshot day.
 *
 * Only the monthly summary rows are used — "Room Occupied" (= room nights on the
 * books) and the Period / "Room Revenue" blocks. The daily grid at the top is
 * ignored. Occupancy %, ADR, pickup/day and pace are DERIVED later
 * (lib/daily/calculations.ts), never stored.
 */

import { parseCsv } from "@/lib/weekly/import/vhp-parse";

export interface PickupSnapshotRow {
  stayYear: number;
  stayMonth: number; // 1-12
  /** Rooms on the books for this stay month (room nights). */
  roomNights: number;
  /** Room revenue on the books for this stay month (IDR), or null if absent. */
  revenue: number | null;
}

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

/** Money/number like "457.00" or "821,658,439" → number (0 on junk). */
function toNumber(s: string | undefined): number {
  const n = Number((s ?? "").replace(/[,\s"]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const MONTH_NUM: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
/** Pull a month number from a label like "01/10 Oct " or "Oct ". */
function monthFromLabel(s: string | undefined): number | null {
  const m = (s ?? "").toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/);
  return m ? MONTH_NUM[m[1]!]! : null;
}

/**
 * Parse a Yearly Forecast Of Room Occupancy CSV into per-stay-month snapshot
 * rows for `reportYear` (the year the snapshot was taken). Columns run forward
 * from the report month, so later columns can roll into reportYear+1. Every
 * forward month the forecast lists is kept — including zero/absent ones — so the
 * snapshot is a faithful reading and day-to-day pickup deltas are well-defined.
 * Returns null if the text isn't that report.
 */
export function parsePickupForecast(text: string, reportYear: number): PickupSnapshotRow[] | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;

  // Daily-grid header: cell 0 is "Date" and the rest are month-labelled columns.
  const header = rows.find((r) => norm(r[0]) === "date" && r.slice(1).some((c) => monthFromLabel(c) != null));
  if (!header) return null;
  const monthCols = header
    .map((c, i) => ({ month: i === 0 ? null : monthFromLabel(c), col: i }))
    .filter((x): x is { month: number; col: number } => x.month != null);
  if (monthCols.length === 0) return null;
  const startMonth = monthCols[0]!.month;

  const roomOcc = rows.find((r) => norm(r[0]) === "room occupied");
  if (!roomOcc) return null;

  // Revenue: each "Period" header names its months; the next "Room Revenue" row
  // carries the values, aligned by column. In a 12-month forward window each
  // calendar month appears exactly once, so keying by month is unambiguous.
  const revenueByMonth = new Map<number, number>();
  for (let i = 0; i < rows.length; i++) {
    if (norm(rows[i]![0]) !== "period") continue;
    const revRow = rows.slice(i + 1).find((r) => norm(r[0]) === "room revenue");
    if (!revRow) continue;
    rows[i]!.forEach((c, idx) => {
      if (idx === 0) return;
      const m = monthFromLabel(c);
      if (m == null) return;
      const v = toNumber(revRow[idx]);
      if (v > 0) revenueByMonth.set(m, v);
    });
  }

  const out: PickupSnapshotRow[] = [];
  for (const { month, col } of monthCols) {
    // Consecutive months from the start → which calendar year this column is in.
    const offset = (month - startMonth + 12) % 12;
    const stayYear = reportYear + Math.floor((startMonth - 1 + offset) / 12);
    const roomNights = Math.round(toNumber(roomOcc[col]));
    const rev = revenueByMonth.get(month);
    out.push({ stayYear, stayMonth: month, roomNights, revenue: rev ?? null });
  }

  return out.length > 0 ? out : null;
}
