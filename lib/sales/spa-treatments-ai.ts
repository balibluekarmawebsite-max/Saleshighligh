/**
 * AI extraction for the Spa "Top Treatments" upload. Sends a pasted table or a
 * screenshot/file to Groq and returns one row per treatment with its PERSON
 * (count) + REVENUE for preview — nothing is written here. The "%" share and the
 * AVERAGE CHECK columns are derived downstream, so the model only needs those
 * two raw numbers per treatment.
 */

import { normalizeTreatmentRows, type NormalTreatmentRow } from "@/lib/sales/spa-treatments-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You extract a hotel SPA "Top Treatments" table into STRICT JSON. Each row is a treatment / package — e.g. "Balinese Massage", "Buccal Face Massage", "Sculpting Face Ritual", "Spa Inclusion" — with a PERSON (count) and a REVENUE. The "%" and the "AVERAGE CHECK" columns are DERIVED — ignore them.

Return ONLY this JSON (no prose, no code fences):
{"treatments":[{"treatmentName":"Balinese Massage","count":<int>,"revenue":<int>}]}

Rules:
- One object per treatment row. Keep the treatment name EXACTLY as written (the "SOB" / treatment column).
- count = the PERSON column; revenue = the REVENUE column. Ignore the %, the Average Check, and any NO/rank column.
- Output plain integers with NO thousand separators: "24.000.000" or "24,000,000" → 24000000; "30" → 30.
- Ignore the TOTAL / GRAND TOTAL row entirely.
- Never invent rows or numbers; read only what is shown.`;

export async function extractSpaTreatments(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<{ ok: true; treatments: NormalTreatmentRow[] } | { ok: false; error: string }> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the table or attach a screenshot/file first." };
  }

  const user = text
    ? `Extract the spa treatment rows (treatment name, person/count, revenue) from this data:\n\n${text}`
    : "Extract the spa treatment rows (treatment name, person/count, revenue) from the attached image.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 2000,
    });
    const parsed = parseJsonLoose(raw) as { treatments?: unknown };
    const rows = Array.isArray(parsed?.treatments) ? (parsed.treatments as never[]) : [];
    const { rows: treatments } = normalizeTreatmentRows(rows);
    if (treatments.length === 0) {
      return { ok: false, error: "No treatment rows could be read — check the table format and try again." };
    }
    return { ok: true, treatments };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
