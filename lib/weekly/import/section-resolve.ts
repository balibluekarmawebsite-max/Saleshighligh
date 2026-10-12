/**
 * Resolve a weekly section from a public letter (B, C, D, EF, …) or an internal
 * id (monthly, segment, …). Used by the token-gated push endpoint so the
 * scraper can address sections the way the report labels them. Pure and
 * client-safe (no server-only imports).
 */

import { AI_IMPORT_SECTIONS, getAiImportSection, type AiImportSection } from "@/lib/weekly/import/ai-sections";

export function resolveSection(raw: string): AiImportSection | { error: string } {
  const s = raw.trim();
  if (!s) return { error: "section is required." };
  const byId = getAiImportSection(s.toLowerCase());
  if (byId) return byId;
  const key = s.toUpperCase().replace(/[\s/]/g, ""); // "E/F" → "EF"
  const matches = AI_IMPORT_SECTIONS.filter((sec) => sec.completionKey.toUpperCase() === key);
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    return { error: `section "${raw}" is ambiguous — use a specific id (${matches.map((m) => m.id).join(", ")}).` };
  }
  return { error: `unknown section "${raw}".` };
}
