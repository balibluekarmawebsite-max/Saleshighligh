/**
 * AI generation for the structured Spa Overview. Builds a compact, pre-formatted
 * context from the spa figures (covers / revenue / average check vs budget, guest
 * segments, top treatments, and month-over-month / year-over-year), then asks
 * Groq for ONE section at a time (Key Challenges / Positive Highlights /
 * Marketing Focus / Key Takeaway). The model only ever quotes the context.
 *
 * The "Upload & compile with AI" path reuses `extractOverview` (unit: "spa")
 * from restaurant-overview-ai — sorting the editor's own notes into the four
 * sections is unit-agnostic.
 */

import { getSpaPageData } from "@/lib/dashboard-data";
import { formatIDRCompact, formatPercent } from "@/lib/format";
import { groqChat, isGroqConfigured } from "@/lib/weekly/groq";
import type { OverviewSection } from "@/lib/sales/restaurant-overview";

const SEG: Record<string, string> = { IN_HOUSE: "In-House", OUTSIDE: "Outside", INCLUSION: "Inclusion" };

function addMonths(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const pct = (a: number, b: number): string | null =>
  b !== 0 ? formatPercent(((a - b) / b) * 100) : null;
const money = (n: number | null | undefined): string | null =>
  n == null ? null : formatIDRCompact(n);

async function spaTotals(property: string, period: string) {
  const d = await getSpaPageData(property, period);
  if (!d || !d.hasData || !d.overview) return null;
  return { revenue: d.overview.revenue.actual, covers: d.overview.covers.actual, data: d };
}

/** Compact, pre-formatted context the model may only quote from. */
async function buildContext(property: string, period: string): Promise<string | null> {
  const cur = await spaTotals(property, period);
  if (!cur) return null;
  const d = cur.data;
  const o = d.overview!;

  const [prev, ly] = await Promise.all([
    spaTotals(property, addMonths(period, -1)),
    spaTotals(property, addMonths(period, -12)),
  ]);

  const ctx = {
    spa: d.property.spaName,
    period,
    covers: {
      actual: o.covers.actual,
      budget: o.covers.budget,
      vsBudget: pct(o.covers.actual, o.covers.budget),
    },
    revenue: {
      actual: money(o.revenue.actual),
      budget: money(o.revenue.budget),
      vsBudget: pct(o.revenue.actual, o.revenue.budget),
      achievement: o.revenueAchievementPct != null ? formatPercent(o.revenueAchievementPct) : null,
    },
    averageCheck: {
      actual: money(o.avgCheckActual),
      budget: money(o.avgCheckBudget),
    },
    monthOverMonth: prev
      ? { prevMonth: addMonths(period, -1), revenue: pct(cur.revenue, prev.revenue), covers: pct(cur.covers, prev.covers) }
      : null,
    yearOverYear: ly
      ? { lastYear: addMonths(period, -12), revenue: pct(cur.revenue, ly.revenue), covers: pct(cur.covers, ly.covers) }
      : null,
    guestSegments: d.segments.map((s) => ({
      segment: SEG[s.segment] ?? s.segment,
      covers: s.coversActual,
      averageCheck: money(s.avgCheckActual),
      revenue: money(s.revenueActual),
      revenueVsBudget: pct(s.revenueActual, s.revenueBudget),
    })),
    topTreatments: d.treatments.slice(0, 10).map((t) => ({
      rank: t.rank,
      treatment: t.treatmentName,
      count: t.count,
      revenue: money(t.revenue),
      averagePrice: money(t.avgPrice),
    })),
  };
  return JSON.stringify(ctx);
}

const SECTION_INSTRUCTION: Record<OverviewSection, string> = {
  challenges:
    "Write the KEY CHALLENGES: 2–4 short bullet points on what underperformed — below-budget revenue or covers, declines vs last month/year, a softer average check, and the weakest guest segment (often in-house). Lead each bullet with the issue.",
  highlights:
    "Write the POSITIVE HIGHLIGHTS: 2–4 short bullet points on what went well — anything above budget or growing vs last month/year, the strongest guest segment, the top treatments, and a resilient average check.",
  marketing:
    "Write the MARKETING FOCUS: 2–4 short, actionable bullet points for next month — e.g. promote the strongest treatment, an inclusion-package push for a weak segment, outside-guest acquisition, in-house spa conversion, or high-value wellness journeys.",
  takeaway:
    "Write the KEY TAKEAWAY: ONE short paragraph (2–3 sentences) summarising the month and the single clearest priority.",
};

const SYSTEM = `You write a hotel spa's monthly Sales Highlight overview in concise, British-neutral hospitality English. You are given a JSON context of the spa's figures. Rules:
- Use ONLY numbers present in the context; never invent or recompute a figure. Quote them as written (e.g. "−8.3%", "Rp 1.2M").
- A vsBudget / revenue / covers value of null means that comparison isn't available — simply don't mention it.
- Bullets must be one line each, no leading dash or bullet character, no headings, no preamble, no markdown.
- Return ONLY the requested section's content as plain text (bullet lines, or a single paragraph for the takeaway). No labels, no JSON.`;

export async function generateSpaOverviewSection(input: {
  property: string;
  period: string;
  section: OverviewSection;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI is not configured — set GROQ_API_KEY on the server." };
  }
  try {
    const context = await buildContext(input.property, input.period);
    if (!context) {
      return { ok: false, error: "No spa figures for this period yet — import the SPA data first." };
    }
    const user = `Spa context (JSON):\n${context}\n\n${SECTION_INSTRUCTION[input.section]}`;
    const raw = await groqChat({ system: SYSTEM, user, temperature: 0.2, maxTokens: 700 });
    const text = String(raw ?? "").trim();
    if (!text) return { ok: false, error: "The AI returned nothing — try again." };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI generation failed." };
  }
}
