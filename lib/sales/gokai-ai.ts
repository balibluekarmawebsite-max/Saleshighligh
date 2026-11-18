/**
 * AI extraction for the Restaurant "Gokai CRM" upload. From a pasted block or a
 * screenshot/file of the Gokai "Guest Experience" report it returns the six
 * metrics plus the month-over-month % each card prints, as FORM values
 * (percentages as percent numbers, MoM signed) for preview. Nothing is written.
 */

import { toInt, toNum, toUsNum } from "@/lib/sales/gokai-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

const SYSTEM = `You read a Gokai "Guest Experience" CRM report and return STRICT JSON. There are six metric cards, each with a value and a month-over-month change (an up/green or down/red arrow + a percentage).

Return ONLY this JSON (no prose, no code fences):
{"signups":<int>,"openRatePct":<number>,"ctrPct":<number>,"surveyCompletionPct":<number>,"upsellSales":<int>,"upsellRevenue":<int>,"signupsMom":<number>,"openRateMom":<number>,"ctrMom":<number>,"surveyMom":<number>,"upsellSalesMom":<number>,"upsellRevenueMom":<number>}

Metric cards → keys:
- "Guests Added" → signups
- "Guest Journey Open Rate" → openRatePct
- "Guest Journey Click-through Rate" → ctrPct
- "Pre-arrival Survey Completion Rate" → surveyCompletionPct
- "Upsell Sales" → upsellSales
- "Upsell Revenue" → upsellRevenue (rupiah; "IDR 0" -> 0)

Rules:
- Percentages (openRatePct, ctrPct, surveyCompletionPct) are PERCENT NUMBERS exactly as shown: "40.816%" -> 40.816, "6.78%" -> 6.78. Do NOT convert to a ratio.
- Each "<metric>Mom" is the "% from last month" on that card as a SIGNED percent: a GREEN / UP arrow is POSITIVE (+8.519 -> 8.519); a RED / DOWN arrow is NEGATIVE ("34.664% from last month" with a down arrow -> -34.664). Keep the exact magnitude even when large (e.g. -349800000).
- Omit a key you cannot read. Never invent numbers. Return ONLY the JSON.`;

const RATE_KEYS: Record<string, string[]> = {
  openRatePct: ["openRatePct", "openRate", "guestJourneyOpenRate"],
  ctrPct: ["ctrPct", "ctr", "clickThroughRate", "guestJourneyClickThroughRate"],
  surveyCompletionPct: ["surveyCompletionPct", "surveyCompletion", "survey", "preArrivalSurveyCompletionRate"],
};
const MOM_KEYS: Record<string, string[]> = {
  signupsMom: ["signupsMom", "guestsAddedMom"],
  openRateMom: ["openRateMom"],
  ctrMom: ["ctrMom", "clickThroughRateMom"],
  surveyMom: ["surveyMom", "surveyCompletionMom"],
  upsellSalesMom: ["upsellSalesMom"],
  upsellRevenueMom: ["upsellRevenueMom"],
};

const pick = (o: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
};

export async function extractGokai(
  input: { text?: string | null; image?: GroqImage | null },
): Promise<{ ok: true; values: Record<string, number> } | { ok: false; error: string }> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the Gokai report or attach a screenshot/file first." };
  }
  const user = text
    ? `Extract the Gokai guest-experience metrics and their month-over-month change from this data:\n\n${text}`
    : "Extract the Gokai guest-experience metrics and their month-over-month change from the attached image.";

  try {
    const raw = await groqChat({
      system: SYSTEM,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: 900,
    });
    const o = parseJsonLoose(raw) as Record<string, unknown>;
    const values: Record<string, number> = {};
    const put = (key: string, v: number | null) => {
      if (v != null) values[key] = v;
    };

    put("signups", toInt(pick(o, ["signups", "guestsAdded", "signUps", "guests"])));
    put("upsellSales", toInt(pick(o, ["upsellSales", "upsellTransactions"])));
    put("upsellRevenue", toNum(pick(o, ["upsellRevenue", "upsellRevenueIdr"])));
    for (const [key, keys] of Object.entries(RATE_KEYS)) put(key, toUsNum(pick(o, keys)));
    for (const [key, keys] of Object.entries(MOM_KEYS)) put(key, toUsNum(pick(o, keys)));

    if (Object.keys(values).length === 0) {
      return { ok: false, error: "No Gokai figures could be read — check the screenshot and try again." };
    }
    return { ok: true, values };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
