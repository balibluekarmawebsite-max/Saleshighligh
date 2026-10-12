import type { NextRequest } from "next/server";

import { checkJobsToken, reportJobResult } from "@/lib/weekly/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Report a scrape job's outcome (VHP_JOBS_INTEGRATION §4). Token-gated and
 * idempotent — a repeat result for an already-closed job still returns ok.
 * Sets status (done|failed), message, and rows written. The CSV itself was
 * already uploaded via /api/import; this is status bookkeeping for the UI.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const tok = checkJobsToken(req);
  if (!tok.ok) return Response.json({ ok: false, error: tok.error }, { status: tok.status });

  let body: { status?: unknown; message?: unknown; written?: unknown; worker?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body." }, { status: 400 });
  }

  const outcome = await reportJobResult(params.id, {
    status: String(body.status ?? ""),
    message: body.message != null ? String(body.message).slice(0, 2000) : null,
    written: typeof body.written === "number" ? body.written : null,
    worker: body.worker != null ? String(body.worker).slice(0, 100) : null,
  });
  if (!outcome.ok) return Response.json({ ok: false, error: outcome.error }, { status: outcome.status });
  return Response.json({ ok: true });
}
