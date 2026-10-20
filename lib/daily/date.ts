/**
 * Daily-report date helpers. Deliberately free of DB/auth imports so they are
 * pure and unit-testable (the import orchestrators that use them pull in Prisma
 * and next-auth, which can't load under vitest).
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Parse an ISO `yyyy-mm-dd` as a UTC-midnight Date. */
export const isoToUtcDate = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** Today as ISO `yyyy-mm-dd` (UTC). */
export const todayIso = (): string => new Date().toISOString().slice(0, 10);

/**
 * True only for a REAL calendar date in `yyyy-mm-dd` form. The regex alone isn't
 * enough: `new Date("2026-02-29T…")` doesn't throw — it silently rolls over to
 * 2026-03-01 (2026 isn't a leap year). Storing a snapshot under the rolled-over
 * day would delete/overwrite a different day's data while reporting the typed
 * date, so we require the parsed date to round-trip back to the same string.
 */
export function isValidIsoDate(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = isoToUtcDate(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
