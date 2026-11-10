/**
 * Pure scraper-health logic — no DB/auth/Date.now imports, so it unit-tests
 * cleanly (the orchestrators in ingestion-health.ts / alerts.ts pull in Prisma
 * and next-auth, which can't load under vitest). Everything time-related takes
 * its "now" or pre-computed WITA dates as arguments.
 */

import type { DailyFeedKey } from "@/lib/monitor/feeds";

export type FeedStatus = "ok" | "stale" | "missing" | "pending";

/**
 * Classify one daily feed from the WITA date of its last successful push.
 *
 *   - "ok"      → a push landed today (WITA).
 *   - "pending" → nothing today yet, but we're still before the morning cutoff,
 *                 so a no-show is "not arrived yet", NOT a failure. This is what
 *                 keeps an early (or manual) check from treating every feed as a
 *                 gap before the ~07:00 pulls land.
 *   - "stale"   → past the cutoff, it pushed before but not today.
 *   - "missing" → past the cutoff, it has never pushed.
 *
 * Only "stale" and "missing" are gaps (see `isGap`). A push dated *after* today
 * (clock skew / manual backfill) still counts as covering today — we only ever
 * want "today or later". `expectedArrived` is "are we past the morning cutoff?"
 * (true by default so the two-arg form keeps the simple semantics).
 */
export function classifyDailyFeed(
  lastPushWitaDate: string | null,
  todayWita: string,
  expectedArrived = true,
): FeedStatus {
  if (lastPushWitaDate && lastPushWitaDate >= todayWita) return "ok";
  if (!expectedArrived) return "pending";
  return lastPushWitaDate ? "stale" : "missing";
}

/** A feed status that needs attention (no fresh push, and past the morning cutoff). */
export function isGap(status: FeedStatus): boolean {
  return status === "stale" || status === "missing";
}

/** Stable key for one gap, used for de-duplication and re-scrape idempotency. */
export function gapKey(propertyCode: string, feed: DailyFeedKey, dateWita: string): string {
  return `${propertyCode.toUpperCase()}:${feed}:${dateWita}`;
}

/** Parse a gap key back into its parts (null if malformed). */
export function parseGapKey(key: string): { property: string; feed: string; date: string } | null {
  const parts = key.split(":");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
  return { property: parts[0], feed: parts[1], date: parts[2] };
}

/** Gaps present now that were NOT in the previous run's open set (what to alert on). */
export function diffNewGaps(currentOpen: string[], priorOpen: string[]): string[] {
  const prior = new Set(priorOpen);
  return currentOpen.filter((k) => !prior.has(k));
}

/**
 * Input for a daily re-pull job (ScrapeJob section "D"). start == end is the one
 * snapshot day to re-pull; createScrapeJob derives the month from it. `feed`
 * targets a single daily feed (null = re-run the whole daily pull).
 */
export function buildDailyRescrapeInput(
  propertyCode: string,
  dateIso: string,
  feed: string | null = null,
): { property: string; section: "D"; start: string; end: string; feed: string | null } {
  return { property: propertyCode.toUpperCase(), section: "D", start: dateIso, end: dateIso, feed };
}

/**
 * Compact "how long ago" label for the monitor, e.g. "just now", "3h ago",
 * "2d ago". `fromMs` null → "never". Pure: both times are passed in.
 */
export function relativeAge(fromMs: number | null, nowMs: number): string {
  if (fromMs == null) return "never";
  const diff = Math.max(0, nowMs - fromMs);
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
