/**
 * AI extraction for the Restaurant Sales Performance upload. Sends a pasted
 * table or a screenshot/file to Groq and returns per-meal covers + revenue
 * (actual & budget) for preview — nothing is written here. Average check, the
 * %, Difference and TOTAL columns are derived downstream, so the model only
 * needs the four raw numbers per meal.
 */

import { normalizeMealRows, type NormalMealRow } from "@/lib/sales/restaurant-sales-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You extract a RESTAURANT SALES PERFORMANCE table into STRICT JSON. The table lists meal periods (Breakfast, Lunch, Dinner) and, for each, the COVERS and the REVENUE in an Actual and a Budget column. Average check, the "%", the "Different" columns and the TOTAL row are DERIVED — ignore them.

Return ONLY this JSON (no prose, no code fences):
{"meals":[{"meal":"Breakfast","coversActual":<int>,"coversBudget":<int>,"revenueActual":<int>,"revenueBudget":<int>}]}

Rules:
- Only Breakfast, Lunch and Dinner. Ignore any TOTAL / GRAND TOTAL row.
- Take COVERS from the "Cover" row and REVENUE from the "Revenue" row — Actual and Budget columns only. Ignore the Average Check row and every % / Different column.
- Output plain integers with NO thousand separators: "137.350.206" or "137,350,206" → 137350206; "892" → 892.
- Never invent numbers; read only what is shown.`;

export async function extractMealSales(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<{ ok: true; meals: NormalMealRow[] } | { ok: false; error: string }> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the table or attach a screenshot/file first." };
  }

  const user = text
    ? `Extract the meal-period covers and revenue (actual + budget) from this data:\n\n${text}`
    : "Extract the meal-period covers and revenue (actual + budget) from the attached image.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 1500,
    });
    const parsed = parseJsonLoose(raw) as { meals?: unknown };
    const rows = Array.isArray(parsed?.meals) ? (parsed.meals as never[]) : [];
    const { rows: meals } = normalizeMealRows(rows);
    if (meals.length === 0) {
      return { ok: false, error: "No meal rows could be read — check the table format and try again." };
    }
    return { ok: true, meals };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
