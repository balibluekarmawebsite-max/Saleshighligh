/**
 * Serialize same-key async work within this process.
 *
 * The weekly sync has three entry points that can write the SAME report's ads /
 * social rows: the Friday auto-sync cron, a manual "Sync now", and (now) report
 * creation. Each does a delete-then-recreate inside one transaction. Because
 * `weekly_ads_campaign` has no unique key, two of these interleaving could
 * duplicate campaign rows (or raise a spurious unique-violation on the daily
 * table). The app runs as a single `next start` process and the cron fires on
 * that same process (an API route), so an in-process lock keyed by report
 * serialises every writer and makes the delete+recreate safe.
 *
 * (A future multi-instance deployment would need a Postgres advisory lock —
 * `SELECT pg_advisory_xact_lock(hashtext(reportId))` — instead; this covers the
 * current single-instance setup without a migration.)
 */

const chains = new Map<string, Promise<unknown>>();

/** Run `fn` after any in-flight work for `key` settles; returns fn's result. */
export function withReportLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  // Chain fn after prev regardless of whether prev resolved or rejected.
  const run = prev.then(() => fn(), () => fn());
  // Store a settled-swallowing tail as the new chain end, and clean up the map
  // entry once this is the last link so the map can't grow unbounded.
  const tail = run.then(
    () => {},
    () => {},
  );
  chains.set(key, tail);
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
}
