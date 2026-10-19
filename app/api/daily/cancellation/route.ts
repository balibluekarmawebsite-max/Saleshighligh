import type { NextRequest } from "next/server";

import { runCancellationImport } from "@/lib/daily/import-cancellation";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_BODY_BYTES = 25 * 1024 * 1024;

/**
 * Token-gated push for the Daily Report's "Cancellation Report" feed.
 *
 * The VHP scraper POSTs the cancellation CSV export here as multipart/form-data:
 *   Authorization: Bearer <IMPORT_API_TOKEN>
 *   property=BKDU
 *   source=vhp:cancellation   (optional, for logs)
 *   file=@cancelled-reservation.csv
 *
 * Each cancel date in the file replaces that day's stored rows (idempotent).
 * Gated by the shared IMPORT_API_TOKEN; excluded from the auth middleware so the
 * token request isn't redirected to /login.
 */
export async function POST(req: NextRequest) {
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

  if (!rateLimit(req, "api-daily-cancellation", 60, 60_000)) return tooManyRequests();

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

  const result = await runCancellationImport({ property, fileBuffer, text, filename, source });
  return Response.json(result.body, { status: result.status });
}
