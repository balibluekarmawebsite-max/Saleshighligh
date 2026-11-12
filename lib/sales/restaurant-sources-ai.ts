/**
 * AI extraction for the Restaurant "Source of Booking" upload. Sends a pasted
 * table or a screenshot/file to Groq and returns one row per source with its
 * PERSON (covers) + REVENUE for preview — nothing is written here. The "%" share
 * and the AVERAGE CHECK columns are derived downstream, so the model only needs
 * those two raw numbers per source.
 */

import { normalizeSourceRows, type NormalSourceRow } from "@/lib/sales/restaurant-sources-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You extract a RESTAURANT "SOURCE OF BOOKING" (SOB) table into STRICT JSON. Each row is a booking source — e.g. "Breakfast in House", "Dinner in House", "Breakfast Outsider", "Dinner Outsider", "Lunch in House", "Lunch Outsider", "Chopee", "Grab & Gojek" — with a PERSON (covers) count and a REVENUE. The "%" and the "AVERAGE CHECK" columns are DERIVED — ignore them.

Return ONLY this JSON (no prose, no code fences):
{"sources":[{"sourceName":"Breakfast in House","persons":<int>,"revenue":<int>}]}

Rules:
- One object per source row. Keep the source name EXACTLY as written (e.g. "Grab & Gojek", "Chopee").
- persons = the PERSON column; revenue = the REVENUE column. Ignore the % and the Average Check columns.
- Output plain integers with NO thousand separators: "131.285.021" or "131,285,021" -> 131285021; "844" -> 844.
- Ignore the TOTAL / GRAND TOTAL row entirely.
- Never invent rows or numbers; read only what is shown.`;

export async function extractSources(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<{ ok: true; sources: NormalSourceRow[] } | { ok: false; error: string }> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the table or attach a screenshot/file first." };
  }

  const user = text
    ? `Extract the source-of-booking rows (source name, persons, revenue) from this data:\n\n${text}`
    : "Extract the source-of-booking rows (source name, persons, revenue) from the attached image.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 2000,
    });
    const parsed = parseJsonLoose(raw) as { sources?: unknown };
    const rows = Array.isArray(parsed?.sources) ? (parsed.sources as never[]) : [];
    const { rows: sources } = normalizeSourceRows(rows);
    if (sources.length === 0) {
      return { ok: false, error: "No source rows could be read — check the table format and try again." };
    }
    return { ok: true, sources };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
