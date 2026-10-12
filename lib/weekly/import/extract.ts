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
  parseJsonLoose,
  type GroqImage,
} from "@/lib/weekly/import/ai";
import {
  buildImportSystemPrompt,
  type AiImportSection,
} from "@/lib/weekly/import/ai-sections";

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
