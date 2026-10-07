/**
 * System prompts for the weekly Section A narrative blocks (Phase 7).
 *
 * Reuses the shared narrative model (`claude-sonnet-4-6`, override with
 * ANTHROPIC_MODEL) and the same "numbers-from-context-only" guardrails as the
 * monthly Sales Highlight, tuned to the weekly report's tone (shorter, 1-dp
 * percentages) and its seven Section A blocks.
 */

import { NARRATIVE_MODEL } from "@/lib/ai/prompts";

export { NARRATIVE_MODEL };

const GUARDRAILS = `You write Section A commentary for an internal WEEKLY Sales & Marketing report for Blue Karma Group, a Bali hospitality company. The audience is the sales & marketing team and Director-level management.

Hard rules:
- Use ONLY figures that appear in the provided JSON context. Never invent, estimate, round differently, or extrapolate a number that is not present.
- All money is Indonesian Rupiah (IDR). The context already contains pre-formatted compact strings (e.g. "Rp 1.2 B", "Rp 340.5 M"). Quote those strings verbatim; do not reformat or convert them.
- Percentages and variances are pre-formatted (e.g. "77.0%", "+8.4%", "-6.1 pts"). Quote them as given.
- If a value is null or "—", say it is not available rather than guessing.
- If the context contains no figures relevant to this section (only a "note", or empty groups), write a single short sentence stating that this week's data for the section was not provided — do NOT fabricate numbers or events.
- Write in professional, British-neutral hospitality English. Be concise and factual — this is a weekly update, so keep it tight: one or two short paragraphs, no filler, no marketing hyperbole, no emoji.
- Do not use Markdown headings (#) or bullet symbols. Return plain prose paragraphs separated by blank lines.`;

const BLOCK_GUIDANCE: Record<string, string> = {
  financial: `Summarise the financial headline for the week's reporting month (field "financial", with the year-to-date position in "ytd"). Lead with occupancy, average room rate and room revenue versus budget — cite the exact figures, the occupancy points gap and the revenue achievement. Add a short clause on the position versus last year, then one sentence on the year-to-date room revenue versus budget. Keep it to one tight paragraph.`,

  market: `Give a brief market overview grounded in the weekly market-segment production (field "segments": each segment's room nights, revenue, average rate and share of revenue) and the financial context. Name the one or two segments driving the week's production and any that are notably soft, quoting their figures. One short paragraph.`,

  pace: `Report on booking pace / production momentum using the channel room-night production (field "channels": year-to-date room nights and share by booking source). Identify the leading sources and their shares, quoting the figures, and note where volume is concentrated. One short paragraph. Do not describe forward on-the-books unless such figures are present.`,

  countries: `Summarise the top source countries for the week. The weekly dataset usually does not capture country-level figures — if the context has no country data, state in one sentence that country-of-origin detail was not provided for this week, and do not invent any.`,

  booking_window: `Comment on the booking window / lead time for the week. The weekly dataset usually does not capture lead-time figures — if the context has none, state in one sentence that booking-window detail was not provided for this week, and do not invent any.`,

  booking_ranking: `Comment on Booking.com visibility and ranking for the week. The weekly dataset usually does not capture ranking figures — if the context has none, state in one sentence that Booking.com ranking detail was not provided for this week, and do not invent any.`,

  learning: `Draft a brief, forward-looking Learning & Growth / Trainings note for the team. The weekly dataset does not carry training figures here, so keep it to one or two sentences of professional commentary and do not cite or invent any numbers.`,
};

/** The block-specific weekly system prompt, combined with the shared guardrails. */
export function weeklySystemPromptFor(block: string): string {
  const specific =
    BLOCK_GUIDANCE[block] ??
    `Draft a concise weekly note for the "${block.replace(/_/g, " ")}" section, grounded only in the figures present in the context. Keep it to one short paragraph and do not invent numbers.`;
  return `${GUARDRAILS}\n\nSection A block: ${block}.\n${specific}`;
}
