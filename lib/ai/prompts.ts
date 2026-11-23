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

  GOKAI_SUMMARY: `Summarise the Gokai guest-experience / upselling-tools performance for the month. Produce these labelled blocks — heading on its own line ending with a colon, then "- " bullets, one blank line between blocks:

Guest Engagement & Conversion Metrics:
- One bullet per engagement metric with its value and month-over-month change, e.g. "Guest Sign-ups: 293 (+8.52% vs last month)", "Guest Journey Open Rate: 40.82% (−34.66% vs last month)". Use the context figures. If a metric has no month-over-month value, give just the value.

Revenue Performance:
- "Upsell Sales: <n> transactions (<MoM>)" and "Upsell Revenue: <IDR> (<MoM>)".

Key Insights:
- 2–4 short bullets: where guest acquisition grew, where engagement or upsell conversion declined, and ONE concrete action to recover upsell performance next month.

Quote ONLY the figures in the context; never write "movement not available" or similar — simply omit the change when it is absent. Do not invent numbers.`,

  TRIPADVISOR_SUMMARY: `Summarise the restaurant's Tripadvisor listing performance for the month. Produce these labelled blocks — heading on its own line ending with a colon, then "- " bullets, one blank line between blocks:

Overall Performance:
- State the ranking and rating from the context, e.g. "Ranked #1 of 483 restaurants in Seminyak with a 5.0/5 rating.". If the ranking is absent, lead with the rating.

Customer Engagement:
- One bullet each for the engagement metrics (menu views, map views, website clicks, phone calls, photo/video views) with value and month-over-month change, e.g. "Menu Views: 48 (+7.00% vs last month)". Omit the change when it is absent.

Digital Presence:
- Listing Impressions and Unique Page Visitors, each with value and month-over-month change.

Key Insights:
- 2–4 short bullets: what rose, what dipped, and ONE concrete action to improve contact actions (calls/website clicks) or visibility next month.

Quote ONLY the figures in the context; simply omit a change when it is absent. Do not invent numbers.`,

  CHOPE_SUMMARY: `Summarise the restaurant's Chope reservation performance for the month. Produce FOUR labelled blocks. Put each heading on its own line ending with a colon, then its bullets ("- " prefixed), with ONE blank line between blocks:

Overall Booking Performance:
- Total Fulfilled Bookings: <n> reservations
- Total Covers (Fulfilled): <n> guests
- Average Party Size: <n> guests per booking
- Revenue Generated via Chope: <IDR>
- Revenue Contribution: <pct>% of restaurant revenue
(ONE metric per bullet — never join them with semicolons; omit a line whose figure is not in the context)

Booking Status Breakdown:
- One bullet per status that has data — Fulfilled, Cancelled, No Show, Upcoming, Walk-ins — each as "<Status>: <bookings> bookings | <covers> covers". Omit a status that is zero across the board.

Booking Sources Breakdown:
- "Chope/Grab Platform: <bookings> bookings | <covers> covers" and "Restaurant Direct Channels: <bookings> bookings | <covers> covers".

Key Insights:
- 2–4 short bullets interpreting booking quality (cancellations/no-shows vs fulfilled), reliance on third-party platforms vs direct channels, and one concrete opportunity for next month.

Quote ONLY the figures in the context. Do not invent numbers or last-year comparisons.`,

  ACQUISITION_SPLIT: `Summarise the restaurant's customer acquisition mix as THREE labelled blocks. Put each heading on its own line ending with a colon, then its content, with ONE blank line between blocks. Use this exact shape:

Bookings Distribution:
- <Channel>: <share of bookings>%[ — up/down X.X pts vs <month>]
(one bullet per channel, "- " prefixed)

Covers Distribution:
- <Channel>: <share of covers>%[ — up/down X.X pts vs <month>]
(one bullet per channel)

Performance Insight:
<a single 2–3 sentence paragraph interpreting the mix — reliance on walk-ins, repeat visitation, advance reservations — and ONE concrete action for next month>

Rules:
- Append the "— up/down X.X pts vs <month>" clause ONLY when a month-over-month movement is given in the context. When it is absent, write just the percentage — NEVER "movement not available", "N/A", "unchanged" or any placeholder.
- Quote ONLY the figures in the context. Do not invent last-year numbers.
- No markdown bold, no headings beyond the three labels, no preamble.`,

  GROUP_SUMMARY: `Write a one-page executive brief for management comparing the three Blue Karma properties — BKDS (Dijiwa Seminyak), BKDU (Dijiwa Ubud) and BKV (Village). Structure it as roughly five short paragraphs:
1. Consolidated Group performance versus budget (total revenue, occupancy, ADR, RevPAR), citing the group figures.
2. Which property led and which lagged on revenue achievement, with the exact figures.
3. Explicitly separate SHARED headwinds or tailwinds (market-wide factors affecting all three) from PROPERTY-SPECIFIC issues.
4. The standout results from the leaderboards (best ROAS campaign, best Tripadvisor position, biggest social growth, top account).
5. Two or three group-level priorities for management.`,
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
