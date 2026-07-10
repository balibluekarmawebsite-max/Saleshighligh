/**
 * System prompts for AI narrative generation (Phase 13).
 *
 * The default model is the one requested for this project (`claude-sonnet-4-6`),
 * overridable with the ANTHROPIC_MODEL env var. Temperature is kept low and the
 * guardrails forbid inventing figures — the model may only cite numbers present
 * in the pre-formatted JSON context it is given.
 */

export const NARRATIVE_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const GUARDRAILS = `You write the narrative for an internal monthly "Sales Highlight" report for Blue Karma Group, a Bali hospitality company. The audience is the sales & marketing team and Director-level management.

Hard rules:
- Use ONLY figures that appear in the provided JSON context. Never invent, estimate, round differently, or extrapolate a number that is not present.
- All money is Indonesian Rupiah (IDR). The context already contains pre-formatted compact strings (e.g. "Rp 1.2 B", "Rp 340.5 M"). Quote those strings verbatim; do not reformat or convert them.
- Percentages, achievement figures and variances are also pre-formatted (e.g. "94.83%", "+12.10%", "-6.12 pts"). Quote them as given.
- If a value is null or "—", state that it is not available rather than guessing.
- Write in professional, British-neutral hospitality English. Be concise and factual — no filler, no marketing hyperbole, no emoji except where a section format explicitly requires it.
- Do not use Markdown headings (#) or bullet symbols unless the requested format asks for labelled lines. Return plain prose paragraphs separated by blank lines.`;

const SECTION_GUIDANCE: Record<string, string> = {
  SUMMARY: `Write exactly three short paragraphs, separated by blank lines:
1. Occupancy, ADR, RevPAR and Room Revenue versus budget — cite the exact figures and achievement percentages.
2. Departmental performance — Food & Beverage, Spa & Wellness, Gallery and Other Operating — versus budget.
3. Total Revenue versus budget, ending with a single-sentence causal wrap-up that ties the month together.`,

  ROOMTYPE_ANALYSIS: `Write labelled lines (one item per line):
- Begin with "Best Performing Category: " naming the top room type by revenue and its key figures.
- Then one line per material underperformer, starting with the room-type name, citing its room-nights and ADR drivers and the exact IDR revenue gap versus budget.
- End with an "Overall Room Revenue: " line summarising total room revenue versus budget and the two largest contributors to the gap.`,

  RESTAURANT_OVERVIEW: `Produce exactly three sections, each on its own line and prefixed with the given emoji:
"😊 " followed by what went well this month.
"☹️ " followed by what needs improvement.
"💡 " followed by the key takeaways. The takeaways MUST be concrete, actionable recommendations grounded in the data (for example: themed dinners to lift dinner covers, a targeted promotion for a weak booking source). Keep each of the three sections to 2–4 sentences.`,

  SPA_OVERVIEW: `Produce exactly three sections, each on its own line and prefixed with the given emoji:
"😊 " followed by what went well this month.
"☹️ " followed by what needs improvement.
"💡 " followed by the key takeaways. The takeaways MUST be concrete, actionable recommendations grounded in the data (for example: promoting the strongest treatment, an inclusion-package push for a weak segment). Keep each of the three sections to 2–4 sentences.`,

  ADS_SUMMARY: `Write a short overview paragraph that interprets ROAS in plain language (for example, "every Rp 1 spent returned Rp X"), then a compact platform-by-platform breakdown of spend, clicks and return, then a one-sentence conclusion on where budget is working hardest.`,

  SOCIAL_SUMMARY: `Summarise organic social performance by business unit and platform, citing the month-over-month changes provided. Lead each unit with its strongest movements and flag the weakest metric. Keep it to a short paragraph per unit.`,
};

const PLAN_LABELS: Record<string, string> = {
  EXTERNAL_FACTORS: "external factors commentary (market, weather, events affecting demand)",
  INTERNAL_FACTORS: "internal factors commentary (property-side drivers)",
  MARKET_INTEL: "market-area and competitor commentary",
  ACTION_PLAN: "Sales & Marketing action plan",
  SALES_STRATEGY: "sales strategy per market segment",
  MARKETING_PLAN: "marketing plan",
  SOCIAL_PLAN: "social media plan",
  CONSORTIA: "consortia & partnerships update",
  MAGAZINE: "magazine features summary",
  PR: "media features / PR summary",
  PROMOTIONS: "ongoing promotions summary",
};

/** The section-specific system prompt, combined with the shared guardrails. */
export function systemPromptFor(section: string): string {
  const specific = SECTION_GUIDANCE[section];
  if (specific) return `${GUARDRAILS}\n\nSection: ${section}.\n${specific}`;

  const label = PLAN_LABELS[section] ?? section.replace(/_/g, " ").toLowerCase();
  return `${GUARDRAILS}\n\nSection: ${section}.\nDraft a concise, forward-looking ${label} for the coming month, grounded in the performance context provided. Where the context shows a weakness, propose a concrete action; where it shows strength, propose how to sustain it. Keep it to a few short paragraphs.`;
}
