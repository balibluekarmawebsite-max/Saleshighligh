/**
 * Office-PC poller heartbeat.
 *
 * Every authenticated `/api/jobs/claim` poll records a timestamp here, so the
 * Request Scrape page can show whether a poller is actually alive — the missing
 * signal when jobs silently sit in "queued" because nothing is claiming them
 * (poller not running, or sending the wrong token so claim 401s and it never
 * sees a job).
 *
 * In-memory + single-process, the same assumption as `lib/rate-limit.ts` (one
 * `next start` instance). It resets to null on restart and repopulates on the
 * next poll — so right after a deploy it reads "no poll yet" until the poller
 * checks in (~every 2 min). If this app is ever run multi-instance, move this to
 * a shared store (Redis/DB) alongside the rate limiter.
 */

export interface PollerHeartbeat {
  /** Epoch milliseconds of the last authenticated claim poll. */
  at: number;
  /** The worker name the poller sent, if any. */
  worker: string | null;
}

let last: PollerHeartbeat | null = null;

/** Record that an authenticated poller just polled the claim endpoint. */
export function recordPollerSeen(worker: string | null): void {
  last = { at: Date.now(), worker: worker && worker !== "unknown" ? worker : null };
}

/** The most recent poller heartbeat, or null if none since the last restart. */
export function getPollerHeartbeat(): PollerHeartbeat | null {
  return last;
}
