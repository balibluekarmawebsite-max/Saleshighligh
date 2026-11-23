/**
 * AI extraction for the Spa "Guest Segment Performance" upload. Sends a pasted
 * table or a screenshot/file to Groq and returns one row per guest segment
 * (In-House / Outside / Inclusion) with its COVER and REVENUE as ACTUAL and
 * BUDGET — for preview only, nothing is written here. The average check, the
 * "%" shares and the variance columns are derived downstream.
 */

import { normalizeSpaPerf, type NormalSpaPerfRow } from "@/lib/sales/spa-performance-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You extract a hotel SPA "Guest Segment Performance" table into STRICT JSON. There are up to three guest segments — In-House, Outside and Inclusion. Each segment block has three rows — Cover, Average Check and Revenue — shown as ACTUAL and BUDGET. Return ONLY the Cover and Revenue numbers (actual and budget); the Average Check, the "%" columns and the "Different" columns are DERIVED — ignore them.

Return ONLY this JSON (no prose, no code fences):
{"segments":[{"segment":"IN_HOUSE","coversActual":<int>,"coversBudget":<int>,"revenueActual":<int>,"revenueBudget":<int>}]}

Rules:
- segment MUST be exactly one of "IN_HOUSE", "OUTSIDE", "INCLUSION". Map "Inhouse Guest" → IN_HOUSE, "Outside Guest" → OUTSIDE, "Inclusion Guest" → INCLUSION.
- coversActual / coversBudget come from the "Cover" row's Actual / Budget columns.
- revenueActual / revenueBudget come from the "Revenue" row's Actual / Budget columns.
- Output plain integers with NO thousand separators: "49.195.436" or "49,195,436" → 49195436; "52" → 52.
- Ignore the Average Check row, every "%" column, every "Different"/"Difference" column, and the overall TOTAL block.
- Also ignore any separate treatment table (e.g. "COLONIC HYDROTHERAPY").
- Never invent rows or numbers; read only what is shown. Omit a segment that is not present.`;

export async function extractSpaPerformance(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<{ ok: true; segments: NormalSpaPerfRow[] } | { ok: false; error: string }> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the table or attach a screenshot/file first." };
  }

  const user = text
    ? `Extract the spa guest-segment performance rows (segment, covers actual/budget, revenue actual/budget) from this data:\n\n${text}`
    : "Extract the spa guest-segment performance rows (segment, covers actual/budget, revenue actual/budget) from the attached image.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 1500,
    });
    const parsed = parseJsonLoose(raw) as { segments?: unknown };
    const rows = Array.isArray(parsed?.segments) ? (parsed.segments as never[]) : [];
    const segments = normalizeSpaPerf(rows);
    if (segments.length === 0) {
      return { ok: false, error: "No guest-segment rows could be read — check the table format and try again." };
    }
    return { ok: true, segments };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
