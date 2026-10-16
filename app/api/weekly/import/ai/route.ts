import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth-helpers";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { getAiImportSection } from "@/lib/weekly/import/ai-sections";
import { extractSectionRows, type ExtractFile } from "@/lib/weekly/import/extract";
import { isWeekId } from "@/lib/weekly/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI data-import extraction for one weekly section. Reads an uploaded CSV /
 * Excel / screenshot, or pasted text, and returns rows matching the section's
 * target columns for preview (nothing is written here). Groq-backed,
 * EDITOR/ADMIN only, rate-limited.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(req, "weekly-ai-import", 20, 60_000)) return tooManyRequests();
  const guard = await requireRole(["ADMIN", "EDITOR"]);
  if ("response" in guard) return guard.response;

  // Note: the Groq gate lives in extractSectionRows now — a spreadsheet in a
  // layout we read deterministically (e.g. Sales Activity) imports without AI.

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }

  const week = String(form.get("week") ?? "");
  const sectionId = String(form.get("section") ?? "");
  const yearRaw = form.get("year");
  const platform = form.get("platform") ? String(form.get("platform")) : undefined;
  const year = yearRaw ? Number(yearRaw) : undefined;
  const text = form.get("text") ? String(form.get("text")) : "";
  const fileField = form.get("file");

  if (!isWeekId(week)) {
    return Response.json({ error: "A valid week is required." }, { status: 400 });
  }
  const section = getAiImportSection(sectionId);
  if (!section) return Response.json({ error: "Unknown section." }, { status: 400 });
  if (section.needsYear && (!year || !Number.isInteger(year))) {
    return Response.json({ error: "Choose a year for this section." }, { status: 400 });
  }

  let file: ExtractFile | null = null;
  if (fileField instanceof File && fileField.size > 0) {
    file = {
      buffer: Buffer.from(await fileField.arrayBuffer()),
      filename: fileField.name,
      type: fileField.type || "",
    };
  }

  const result = await extractSectionRows(section, { file, text, year, platform });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({
    ok: true,
    section: section.id,
    rows: result.rows,
    note: result.rows.length === 0 ? "The AI did not find any rows to import from this input." : undefined,
  });
}
