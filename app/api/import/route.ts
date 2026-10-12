import type { NextRequest } from "next/server";

import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isGroqConfigured } from "@/lib/weekly/import/ai";
import { runApiImport } from "@/lib/weekly/import/api-import";
import { type ExtractFile } from "@/lib/weekly/import/extract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/**
 * Token-gated data push for the weekly report (Path A).
 *
 * The VHP scraper POSTs a section's CSV export here as multipart/form-data:
 *   Authorization: Bearer <IMPORT_API_TOKEN>
 *   property=BKDS  section=C  week_ending=2026-10-08
 *   source=vhp:reservation-by-creation-date   (optional, for logs)
 *   file=@export.csv
 *
 * It finds-or-creates that property+week's DRAFT report, runs the same
 * "Process with AI" extraction the UI uses, and replaces that one section's
 * data. Gated by a shared secret (IMPORT_API_TOKEN); no user session needed.
 * This route is excluded from the auth middleware so the token request isn't
 * redirected to /login.
 */
export async function POST(req: NextRequest) {
  // ── Auth: shared secret ──────────────────────────────────────────────────
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

  if (!rateLimit(req, "api-import", 60, 60_000)) return tooManyRequests();

  if (!isGroqConfigured()) {
    return Response.json(
      { ok: false, error: "AI import is not configured — set GROQ_API_KEY on the server." },
      { status: 501 },
    );
  }

  // ── Parse the multipart body ─────────────────────────────────────────────
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "invalid upload (expected multipart/form-data)." }, { status: 400 });
  }

  const property = String(form.get("property") ?? "");
  const section = String(form.get("section") ?? "");
  const weekEnding = String(form.get("week_ending") ?? "");
  const source = form.get("source") ? String(form.get("source")) : undefined;
  const platform = form.get("platform") ? String(form.get("platform")) : undefined;
  const yearRaw = form.get("year");
  const year = yearRaw ? Number(yearRaw) : undefined;
  const text = form.get("text") ? String(form.get("text")) : undefined;
  const fileField = form.get("file");

  if (!property || !section || !weekEnding) {
    return Response.json(
      { ok: false, error: "property, section and week_ending are required." },
      { status: 400 },
    );
  }
  if (yearRaw && (year === undefined || !Number.isInteger(year))) {
    return Response.json({ ok: false, error: "year must be a whole number." }, { status: 400 });
  }

  let file: ExtractFile | null = null;
  if (fileField instanceof File && fileField.size > 0) {
    if (fileField.size > MAX_FILE_BYTES) {
      return Response.json({ ok: false, error: "file is larger than 20 MB." }, { status: 400 });
    }
    file = {
      buffer: Buffer.from(await fileField.arrayBuffer()),
      filename: fileField.name,
      type: fileField.type || "",
    };
  }
  if (!file && !(text && text.trim())) {
    return Response.json({ ok: false, error: "a file (or text) is required." }, { status: 400 });
  }

  const result = await runApiImport({ property, section, weekEnding, file, text, year, platform, source });
  return Response.json(result.body, { status: result.status });
}
