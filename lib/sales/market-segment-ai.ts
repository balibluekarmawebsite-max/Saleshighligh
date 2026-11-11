/**
 * AI extraction for the Market Segment manual-upload flow. Sends pasted text or
 * a screenshot to Groq and returns clean segment rows for preview (nothing is
 * written here). Reuses the weekly module's Groq client.
 */

import { normalizeExtraction, type ExtractedSegment } from "@/lib/sales/market-segment-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You extract HOTEL MARKET SEGMENT production figures from a pasted table or a screenshot into STRICT JSON. Market segments are booking channels/categories such as "OTA (Online Travel Agent)", "Travel Agent", "Corporate", "Wholesaler/B2B", "Direct Booking", "Government", "Long Stay", "Complimentary", etc.

For each segment row, read up to three series when present:
- This Year / Actual
- Budget
- Last Year

and for each series its Room Nights, ARR (average room rate), and Room Revenue.

Return ONLY this JSON (no prose, no code fences):
{"segments":[{"segment":"<name>","ty_rn":<int>,"ty_arr":<number>,"ty_rev":<number>,"bud_rn":<int>,"bud_arr":<number>,"bud_rev":<number>,"ly_rn":<int>,"ly_arr":<number>,"ly_rev":<number>}]}

Rules:
- Numbers only — strip currency symbols (Rp), thousands separators and spaces. "1.912.489" or "1,912,489" → 1912489.
- Omit a key (or use 0) when a figure is absent; use 0 for a whole series that isn't shown.
- Do NOT include a TOTAL/GRAND TOTAL row — only real segments.
- Keep segment names as written in the source.
- Never invent numbers; only read what is shown.`;

export async function extractMarketSegments(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<{ ok: true; segments: ExtractedSegment[] } | { ok: false; error: string }> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the segment table or attach a screenshot first." };
  }

  const user = text
    ? `Extract the market segment rows from this data:\n\n${text}`
    : "Extract the market segment rows from the attached screenshot.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image, // vision models reject response_format
      temperature: 0,
      maxTokens: 4000,
    });
    const segments = normalizeExtraction(parseJsonLoose(raw));
    if (segments.length === 0) {
      return { ok: false, error: "No segment rows could be read from that input — check the format and try again." };
    }
    return { ok: true, segments };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
