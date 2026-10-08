/**
 * Weekly-report period helpers.
 *
 * A reporting "week" runs Friday–Thursday and is identified in the URL by its
 * END date (the Thursday) in `yyyy-mm-dd` form. Exact boundary/ISO-week math is
 * refined alongside the weekly calculation layer in a later phase; these helpers
 * cover id validation, the current week, and a human label.
 */

const WEEK_ID_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True when `value` looks like a week id (yyyy-mm-dd). */
export function isWeekId(value: string): boolean {
  return WEEK_ID_RE.test(value);
}

/**
 * The id (yyyy-mm-dd) of the most recent reporting-week end (a Thursday) on or
 * before `date`. Called at request time, never at module load.
 */
export function currentWeekId(date: Date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const day = d.getUTCDay(); // 0=Sun … 4=Thu … 6=Sat
  const sinceThursday = (day - 4 + 7) % 7;
  d.setUTCDate(d.getUTCDate() - sinceThursday);
  return d.toISOString().slice(0, 10);
}

/** ISO 8601 week number for a date. */
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // nearest Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const diff = date.getTime() - firstThursday.getTime();
  return 1 + Math.round(diff / (7 * 24 * 3600 * 1000));
}

export interface WeekMeta {
  startDate: Date;
  endDate: Date;
  year: number;
  weekNumber: number;
  label: string;
}

/** Derive the full week metadata (Fri–Thu) from a week id (its Thursday end). */
export function weekMeta(weekId: string): WeekMeta | null {
  if (!isWeekId(weekId)) return null;
  const endDate = new Date(`${weekId}T00:00:00.000Z`);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - 6);
  return {
    startDate,
    endDate,
    year: endDate.getUTCFullYear(),
    weekNumber: isoWeek(endDate),
    label: weekLabel(weekId),
  };
}

/** The week id (Thursday end) `weeks` before/after `weekId` (negative = earlier). */
export function shiftWeekId(weekId: string, weeks: number): string {
  if (!isWeekId(weekId)) return weekId;
  const d = new Date(`${weekId}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
}

/** Human label for a week id, e.g. "25 Sep – 1 Oct 2026" (Fri–Thu span). */
export function weekLabel(weekId: string): string {
  if (!isWeekId(weekId)) return weekId;
  const end = new Date(`${weekId}T00:00:00.000Z`);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  const startStr = start.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const endStr = end.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${startStr} – ${endStr}`;
}
