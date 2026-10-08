import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";

import { requireRole } from "@/lib/auth-helpers";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  coerceRows,
  groqChat,
  isGroqConfigured,
  parseJsonLoose,
  type GroqImage,
} from "@/lib/weekly/import/ai";
import {
  buildImportSystemPrompt,
  getAiImportSection,
} from "@/lib/weekly/import/ai-sections";
import { isWeekId } from "@/lib/weekly/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 12000;
const IMG_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

/** Dump every sheet of a workbook to CSV text (truncated). */
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

  if (!isGroqConfigured()) {
    return Response.json(
      { error: "AI import is not configured — set GROQ_API_KEY on the server." },
      { status: 501 },
    );
  }

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
  const file = form.get("file");

  if (!isWeekId(week)) {
    return Response.json({ error: "A valid week is required." }, { status: 400 });
  }
  const section = getAiImportSection(sectionId);
  if (!section) return Response.json({ error: "Unknown section." }, { status: 400 });
  if (section.needsYear && (!year || !Number.isInteger(year))) {
    return Response.json({ error: "Choose a year for this section." }, { status: 400 });
  }

  // Build the model input from the file or the pasted text.
  let userContent = "";
  let image: GroqImage | null = null;
  if (file instanceof File && file.size > 0) {
    if (file.size > 20 * 1024 * 1024) {
      return Response.json({ error: "File is larger than 20 MB." }, { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const type = file.type || "";
    const isImage = IMG_TYPES.has(type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name);
    if (isImage) {
      if (buf.length > 8 * 1024 * 1024) {
        return Response.json({ error: "Image is larger than 8 MB — downscale it first." }, { status: 400 });
      }
      image = { data: buf.toString("base64"), mediaType: type || "image/png" };
      userContent = "Extract the data from this screenshot into the required rows.";
    } else {
      const asText = workbookToText(buf);
      if (!asText.trim()) {
        return Response.json({ error: "Could not read any rows from that file." }, { status: 400 });
      }
      userContent = `INPUT DATA (CSV / spreadsheet dump):\n\n${asText}`;
    }
  } else if (text.trim()) {
    userContent = `INPUT DATA (pasted text):\n\n${text.slice(0, MAX_TEXT)}`;
  } else {
    return Response.json({ error: "Attach a file or paste some text." }, { status: 400 });
  }

  const system = buildImportSystemPrompt(section, year, platform);

  let content: string;
  try {
    content = await groqChat({
      system,
      user: userContent,
      image,
      jsonMode: !image,
      maxTokens: 4000,
    });
  } catch (err) {
    const m = err instanceof Error ? err.message : "AI request failed.";
    return Response.json({ error: m }, { status: 502 });
  }

  let rows: Record<string, string>[];
  try {
    const parsed = parseJsonLoose(content) as { rows?: unknown } | unknown[];
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { rows?: unknown }).rows)
        ? (parsed as { rows: unknown[] }).rows
        : [];
    rows = coerceRows(arr, section.fields.map((fl) => fl.key));
  } catch (err) {
    const m = err instanceof Error ? err.message : "Could not parse the AI output.";
    return Response.json({ error: m }, { status: 502 });
  }

  return Response.json({
    ok: true,
    section: section.id,
    rows,
    note: rows.length === 0 ? "The AI did not find any rows to import from this input." : undefined,
  });
}
