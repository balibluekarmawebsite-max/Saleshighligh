import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { requireRole } from "@/lib/auth-helpers";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { coerceRows, groqChat, isGroqConfigured, parseJsonLoose } from "@/lib/weekly/import/ai";
import { AI_IMPORT_SECTIONS } from "@/lib/weekly/import/ai-sections";
import { applyAiImport } from "@/lib/weekly/import/ai-actions";
import { isWeekId } from "@/lib/weekly/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 28000;

function workbookToText(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: "buffer" });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) parts.push(`# Sheet: ${name}\n${csv}`);
  }
  return parts.join("\n\n").slice(0, MAX_TEXT);
}

function combinedSystemPrompt(year: number): string {
  const sectionLines = AI_IMPORT_SECTIONS.map((s) => {
    const keys = s.fields.map((f) => `"${f.key}"`).join(", ");
    return `- "${s.id}" (${s.title}): rows with keys ${keys}. ${s.rules}`;
  }).join("\n");

  return `You are a careful data-extraction assistant for a hotel's weekly Sales & Marketing report (Blue Karma Group, Bali; currency IDR).

You are given a full weekly-report workbook, with each sheet dumped as CSV. Map the data into the report's sections. The target year for channel room nights is ${year}; the default social platform is "Instagram".

Output ONLY a single JSON object of the form: {"sections": { "<section_id>": [ ...rows... ], ... }}.
Only include a section if the workbook actually contains data for it. Each row uses EXACTLY that section's keys.

Sections:
${sectionLines}

Global rules:
- Use ONLY information present in the workbook. Never invent numbers. Missing value → null.
- Money: plain number, no currency symbol or thousand separators.
- Percent (occupancy): the number only (e.g. 77.0), range 0–100, not a fraction.
- Skip header, totals and empty rows. Return the JSON object only — no prose, no markdown fences.`;
}

/**
 * Full-workbook AI import: reads every sheet, asks the model to arrange the
 * data into all report sections at once, then applies each section (replace-
 * all). Groq-backed, EDITOR/ADMIN only.
 */
export async function POST(req: NextRequest) {
  if (!rateLimit(req, "weekly-ai-workbook", 6, 60_000)) return tooManyRequests();
  const guard = await requireRole(["ADMIN", "EDITOR"]);
  if ("response" in guard) return guard.response;
  if (!isGroqConfigured()) {
    return Response.json({ error: "AI import is not configured — set GROQ_API_KEY." }, { status: 501 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Invalid upload." }, { status: 400 });
  }
  const property = String(form.get("property") ?? "").toUpperCase();
  const week = String(form.get("week") ?? "");
  const year = Number(form.get("year")) || new Date().getUTCFullYear();
  const file = form.get("file");

  if (!isWeekId(week)) return Response.json({ error: "A valid week is required." }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Attach an .xlsx workbook." }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return Response.json({ error: "File is larger than 20 MB." }, { status: 400 });
  }

  const text = workbookToText(Buffer.from(await file.arrayBuffer()));
  if (!text.trim()) return Response.json({ error: "Could not read any rows from the workbook." }, { status: 400 });

  let content: string;
  try {
    content = await groqChat({
      system: combinedSystemPrompt(year),
      user: `WORKBOOK (CSV dump of every sheet):\n\n${text}`,
      jsonMode: true,
      maxTokens: 8000,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "AI request failed." }, { status: 502 });
  }

  let sections: Record<string, unknown>;
  try {
    const parsed = parseJsonLoose(content) as { sections?: Record<string, unknown> };
    sections = parsed.sections ?? (parsed as Record<string, unknown>);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not parse AI output." }, { status: 502 });
  }

  const applied: { section: string; title: string; count: number }[] = [];
  for (const spec of AI_IMPORT_SECTIONS) {
    const raw = sections[spec.id];
    if (!Array.isArray(raw)) continue;
    const rows = coerceRows(raw, spec.fields.map((f) => f.key));
    if (rows.length === 0) continue;
    const r = await applyAiImport({
      property,
      week,
      section: spec.id,
      rows,
      year: spec.needsYear ? year : undefined,
      platform: spec.needsPlatform ? "Instagram" : undefined,
    });
    if (r.ok && (r.written ?? 0) > 0) {
      applied.push({ section: spec.id, title: spec.title, count: r.written ?? 0 });
    }
  }

  if (applied.length === 0) {
    return Response.json({ error: "The AI could not map any sections from this workbook." }, { status: 422 });
  }
  return Response.json({ ok: true, applied });
}
