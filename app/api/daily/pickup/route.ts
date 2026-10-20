import type { NextRequest } from "next/server";

import { getPickupSummary } from "@/lib/daily/pickup-data";
import { runPickupImport } from "@/lib/daily/import-pickup";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

/** Shared-secret bearer check for this feed (same token as the import push). */
function checkToken(req: NextRequest): Response | null {
  const token = process.env.IMPORT_API_TOKEN;
  if (!token) {
    return Response.json(
      { ok: false, error: "IMPORT_API_TOKEN is not set on the server — refusing to accept pushes." },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${token}`) {
    return Response.json({ ok: false, error: "invalid token" }, { status: 401 });
  }
  return null;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BODY_BYTES = 25 * 1024 * 1024;

/**
 * Token-gated push for the Daily Report's "Occupancy Pickup Report" feed.
 *
 * The VHP scraper POSTs the "Yearly Forecast Of Room Occupancy" CSV export here
 * once a day as multipart/form-data:
 *   Authorization: Bearer <IMPORT_API_TOKEN>
 *   property=BKDU
 *   snapshotDate=2026-10-20   (optional; defaults to today UTC)
 *   source=vhp:pickup         (optional, for logs)
 *   file=@yearly-occupancy.csv
 *
 * Each snapshot date replaces that day's stored rows (idempotent). Gated by the
 * shared IMPORT_API_TOKEN; excluded from the auth middleware so the token
 * request isn't redirected to /login.
 */
export async function POST(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;

  if (!rateLimit(req, "api-daily-pickup", 60, 60_000)) return tooManyRequests();

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "request body is too large (max 25 MB)." }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "invalid upload (expected multipart/form-data)." }, { status: 400 });
  }

  const property = String(form.get("property") ?? "");
  const snapshotDate = form.get("snapshotDate") ? String(form.get("snapshotDate")) : undefined;
  const source = form.get("source") ? String(form.get("source")) : undefined;
  const text = form.get("text") ? String(form.get("text")) : undefined;
  const fileField = form.get("file");

  if (!property) {
    return Response.json({ ok: false, error: "property is required." }, { status: 400 });
  }

  let fileBuffer: Buffer | null = null;
  let filename: string | undefined;
  if (fileField instanceof File && fileField.size > 0) {
    if (fileField.size > MAX_FILE_BYTES) {
      return Response.json({ ok: false, error: "file is larger than 20 MB." }, { status: 400 });
    }
    fileBuffer = Buffer.from(await fileField.arrayBuffer());
    filename = fileField.name;
  }
  if (!fileBuffer && !(text && text.trim())) {
    return Response.json({ ok: false, error: "a file (or text) is required." }, { status: 400 });
  }

  const result = await runPickupImport({ property, snapshotDate, fileBuffer, text, filename, source });
  return Response.json(result.body, { status: result.status });
}

/**
 * Verify what landed. GET with the same bearer token:
 *   /api/daily/pickup?property=BKDU[&from=2026-10-01&to=2026-10-31]
 * Returns, per snapshot day (newest first), the rooms (and revenue) on the books
 * for each stay month, so a push can be confirmed.
 */
export async function GET(req: NextRequest) {
  const authError = checkToken(req);
  if (authError) return authError;

  if (!rateLimit(req, "api-daily-pickup-get", 120, 60_000)) return tooManyRequests();

  const { searchParams } = new URL(req.url);
  const property = (searchParams.get("property") ?? "").trim();
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  if (!property) {
    return Response.json({ ok: false, error: "property query param is required." }, { status: 400 });
  }

  let summary;
  try {
    summary = await getPickupSummary(property, from, to);
  } catch (error) {
    // Most likely the migration hasn't been applied yet (table missing) — return
    // a readable message instead of a bare 500.
    const message = error instanceof Error ? error.message : "query failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
  if (!summary) {
    return Response.json({ ok: false, error: `unknown property "${property}".` }, { status: 400 });
  }
  return Response.json({ ok: true, ...summary });
}
