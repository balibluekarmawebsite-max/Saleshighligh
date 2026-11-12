/**
 * AI extraction for the OTA Ranking Tracker. Sends pasted text or a screenshot
 * (an OTA ranking panel / Tripadvisor listing) to Groq and returns clean
 * ranking rows for preview — nothing is written here. Reuses the weekly Groq
 * client.
 */

import { normalizeRankings, type NormalRankingRow } from "@/lib/sales/ota-ranking-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You extract HOTEL OTA RANKING positions from pasted text or a screenshot into STRICT JSON. The tracked platforms are Booking.com, Expedia and Tripadvisor. A "rank" is the hotel's position in its market/area (a smaller number is better, e.g. #3). "totalInMarket" is how many properties are ranked in that market (e.g. "3 of 48" → rank 3, total 48). "rating" is the review score (Booking/Expedia ~0-10, Tripadvisor ~0-5).

Return ONLY this JSON (no prose, no code fences):
{"rankings":[{"platform":"Booking.com","rank":<int>,"totalInMarket":<int|null>,"rating":<number|null>}]}

Rules:
- Only the three platforms above; ignore anything else (Agoda, Google, etc.).
- rank is REQUIRED and positive; drop a platform you can't read a rank for.
- Strip "#", "of", thousands separators: "#3 of 1,248" → rank 3, totalInMarket 1248.
- Use null when totalInMarket or rating isn't shown. Never invent numbers.`;

export async function extractOtaRankings(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<{ ok: true; rankings: NormalRankingRow[] } | { ok: false; error: string }> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the ranking text or attach a screenshot first." };
  }

  const user = text
    ? `Extract the OTA ranking rows from this data:\n\n${text}`
    : "Extract the OTA ranking rows from the attached screenshot.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 1500,
    });
    const parsed = parseJsonLoose(raw) as { rankings?: unknown };
    const rows = Array.isArray(parsed?.rankings) ? (parsed.rankings as never[]) : [];
    const { rows: rankings } = normalizeRankings(rows);
    if (rankings.length === 0) {
      return { ok: false, error: "No ranking rows could be read from that input — check the format and try again." };
    }
    return { ok: true, rankings };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
