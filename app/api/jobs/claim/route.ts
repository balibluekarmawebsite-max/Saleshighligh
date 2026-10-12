import type { NextRequest } from "next/server";

import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { checkJobsToken, claimNextJob } from "@/lib/weekly/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Claim the oldest queued scrape job (VHP_JOBS_INTEGRATION §3). Atomically flips
 * it to "running" and hands it to the caller; re-queues crashed leases first.
 * Token-gated (IMPORT_API_TOKEN or VHP_JOBS_TOKEN); excluded from the session
 * middleware. Returns `{ "job": {...} }` or `{ "job": null }` when the queue is
 * empty.
 */
export async function POST(req: NextRequest) {
  const tok = checkJobsToken(req);
  if (!tok.ok) return Response.json({ ok: false, error: tok.error }, { status: tok.status });
  if (!rateLimit(req, "jobs-claim", 120, 60_000)) return tooManyRequests();

  let worker = "unknown";
  try {
    const body = (await req.json()) as { worker?: unknown };
    if (body.worker) worker = String(body.worker).slice(0, 100);
  } catch {
    // empty / invalid body → default worker name
  }

  const job = await claimNextJob(worker);
  return Response.json({ job });
}
