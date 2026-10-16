/**
 * Shared AI extraction for the weekly Data Import.
 *
 * Turns an uploaded CSV / Excel / screenshot (or pasted text) into rows
 * matching one section's target columns, via Groq. No DB writes, no auth —
 * callers (the interactive preview route and the token-gated push endpoint)
 * handle those. Returns a discriminated result so callers can map failures to
 * the right HTTP status.
 *
 * Assumes Groq is configured (`isGroqConfigured()` is the caller's gate).
 */

import * as XLSX from "xlsx";

import {
  coerceRows,
  groqChat,
  isGroqConfigured,
  parseJsonLoose,
  type GroqImage,
} from "@/lib/weekly/import/ai";
import {
  buildImportSystemPrompt,
  type AiImportSection,
} from "@/lib/weekly/import/ai-sections";
import {
  type ActivityRow,
  detectSalesActivityInWorkbook,
} from "@/lib/weekly/import/sales-activity-workbook";

const activityToRow = (r: ActivityRow): Record<string, string> => ({
  dateLabel: r.dateLabel,
  title: r.title,
  notes: r.notes,
});

/**
 * Deterministic spreadsheet readers by section id. For a non-image file these run
 * BEFORE the AI: they read the report's own layout in full (no 12k-char / token
 * truncation), so a long Sales-Activity sheet imports completely. The AI remains
 * the fallback for screenshots, pasted text and layouts these don't recognise.
 */
const DETERMINISTIC_READERS: Record<string, (buf: Buffer) => Record<string, string>[]> = {
  sales: (buf) => detectSalesActivityInWorkbook(buf).map(activityToRow),
  ecommerce: (buf) => detectSalesActivityInWorkbook(buf).map(activityToRow),
};

const MAX_TEXT = 12000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMG_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);

export type ExtractResult =
  | { ok: true; rows: Record<string, string>[] }
  | { ok: false; status: number; error: string };

export interface ExtractFile {
  buffer: Buffer;
  filename: string;
  type: string;
}

export interface ExtractInput {
  file?: ExtractFile | null;
  text?: string;
  year?: number;
  platform?: string;
}

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

/** Extract section rows from a file or pasted text. */
export async function extractSectionRows(
  section: AiImportSection,
  input: ExtractInput,
): Promise<ExtractResult> {
  const { file, text, year, platform } = input;

  // Build the model input from the file or the pasted text.
  let userContent = "";
  let image: GroqImage | null = null;

  if (file && file.buffer.length > 0) {
    if (file.buffer.length > MAX_FILE_BYTES) {
      return { ok: false, status: 400, error: "File is larger than 20 MB." };
    }
    const type = file.type || "";
    const isImage = IMG_TYPES.has(type) || /\.(png|jpe?g|webp|gif)$/i.test(file.filename);
    if (isImage) {
      if (file.buffer.length > MAX_IMAGE_BYTES) {
        return { ok: false, status: 400, error: "Image is larger than 8 MB — downscale it first." };
      }
      image = { data: file.buffer.toString("base64"), mediaType: type || "image/png" };
      userContent = "Extract the data from this screenshot into the required rows.";
    } else {
      // Deterministic-first: read the known layout in full before falling back
      // to the AI (which truncates long sheets).
      const reader = DETERMINISTIC_READERS[section.id];
      if (reader) {
        const rows = reader(file.buffer);
        if (rows.length > 0) return { ok: true, rows };
      }
      const asText = workbookToText(file.buffer);
      if (!asText.trim()) {
        return { ok: false, status: 400, error: "Could not read any rows from that file." };
      }
      userContent = `INPUT DATA (CSV / spreadsheet dump):\n\n${asText}`;
    }
  } else if (text && text.trim()) {
    userContent = `INPUT DATA (pasted text):\n\n${text.slice(0, MAX_TEXT)}`;
  } else {
    return { ok: false, status: 400, error: "Attach a file or paste some text." };
  }

  // Reaching here means the deterministic readers didn't resolve it, so the AI
  // is required — gate on Groq now (not at the route) so a deterministic read
  // above never needs it.
  if (!isGroqConfigured()) {
    return {
      ok: false,
      status: 501,
      error:
        "AI import isn't configured (set GROQ_API_KEY on the server). An Excel/CSV in the standard Sales-Activity layout is read without AI — check the Date / Subject / Remarks columns.",
    };
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
    return { ok: false, status: 502, error: m };
  }

  try {
    const parsed = parseJsonLoose(content) as { rows?: unknown } | unknown[];
    const arr = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { rows?: unknown }).rows)
        ? (parsed as { rows: unknown[] }).rows
        : [];
    const rows = coerceRows(arr, section.fields.map((fl) => fl.key));
    return { ok: true, rows };
  } catch (err) {
    const m = err instanceof Error ? err.message : "Could not parse the AI output.";
    return { ok: false, status: 502, error: m };
  }
}
