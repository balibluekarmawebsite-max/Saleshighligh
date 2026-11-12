/**
 * AI generation for the structured Restaurant Overview. Builds a compact,
 * pre-formatted context from the restaurant figures (actual vs budget, meal
 * periods, and month-over-month / year-over-year), then asks Groq for ONE
 * section at a time (Key Challenges / Positive Highlights / Marketing Focus /
 * Key Takeaway). The model only ever quotes the numbers in the context.
 */

import { getRestaurantPageData } from "@/lib/dashboard-data";
import { formatIDRCompact, formatPercent } from "@/lib/format";
import { groqChat, isGroqConfigured, type GroqImage } from "@/lib/weekly/groq";
import type { OverviewSection } from "@/lib/sales/restaurant-overview";

function addMonths(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y!, (m ?? 1) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const pct = (a: number, b: number): string | null =>
  b !== 0 ? formatPercent(((a - b) / b) * 100) : null;

async function restaurantTotals(property: string, period: string) {
  const d = await getRestaurantPageData(property, period);
  if (!d || !d.hasData || !d.overview) return null;
  const covers = d.meals.reduce((s, m) => s + m.coversActual, 0);
  return { revenue: d.restaurantRevenueActual, covers, data: d };
}

/** Compact, pre-formatted context the model may only quote from. */
async function buildContext(property: string, period: string): Promise<string | null> {
  const cur = await restaurantTotals(property, period);
  if (!cur) return null;
  const d = cur.data;
  const o = d.overview!;

  const [prev, ly] = await Promise.all([
    restaurantTotals(property, addMonths(period, -1)),
    restaurantTotals(property, addMonths(period, -12)),
  ]);

  const ctx = {
    restaurant: d.property.restaurantName,
    period,
    covers: {
      actual: cur.covers,
      budget: o.covers.budget,
      vsBudget: pct(o.covers.actual, o.covers.budget),
    },
    revenue: {
      actual: formatIDRCompact(o.revenue.actual),
      budget: formatIDRCompact(o.revenue.budget),
      vsBudget: pct(o.revenue.actual, o.revenue.budget),
      achievement: o.revenueAchievementPct != null ? formatPercent(o.revenueAchievementPct) : null,
    },
    averageCheck: {
      actual: o.avgCheckActual != null ? formatIDRCompact(o.avgCheckActual) : null,
      budget: o.avgCheckBudget != null ? formatIDRCompact(o.avgCheckBudget) : null,
    },
    monthOverMonth: prev
      ? { prevMonth: addMonths(period, -1), revenue: pct(cur.revenue, prev.revenue), covers: pct(cur.covers, prev.covers) }
      : null,
    yearOverYear: ly
      ? { lastYear: addMonths(period, -12), revenue: pct(cur.revenue, ly.revenue), covers: pct(cur.covers, ly.covers) }
      : null,
    mealPeriods: d.meals.map((m) => ({
      meal: m.meal,
      covers: m.coversActual,
      averageCheck: m.avgCheckActual != null ? formatIDRCompact(m.avgCheckActual) : null,
      revenue: formatIDRCompact(m.revenueActual),
      shareOfRevenue: formatPercent(m.pctOfRevenue),
      revenueVsBudget: pct(m.revenueActual, m.revenueBudget),
    })),
  };
  return JSON.stringify(ctx);
}

const SECTION_INSTRUCTION: Record<OverviewSection, string> = {
  challenges:
    "Write the KEY CHALLENGES: 2–4 short bullet points on what underperformed — below-budget revenue, declines vs last month/year, and the weakest meal period(s). Lead each bullet with the issue.",
  highlights:
    "Write the POSITIVE HIGHLIGHTS: 2–4 short bullet points on what went well — anything above budget or growing vs last month/year, and the strongest meal period (often a higher average check).",
  marketing:
    "Write the MARKETING FOCUS: 2–4 short, actionable bullet points of what to do next month to fix the challenges and build on the highlights (e.g. festive dining, driving dinner traffic, outside-guest acquisition, high-value lunch promotions).",
  takeaway:
    "Write the KEY TAKEAWAY: ONE short paragraph (2–3 sentences) summarising the month and the single clearest priority.",
};

const SYSTEM = `You write a hotel restaurant's monthly Sales Highlight overview in concise, British-neutral hospitality English. You are given a JSON context of the restaurant's figures. Rules:
- Use ONLY numbers present in the context; never invent or recompute a figure. Quote them as written (e.g. "−8.3%", "Rp 1.2M").
- A vsBudget / revenue / covers value of null means that comparison isn't available — simply don't mention it.
- Bullets must be one line each, no leading dash or bullet character, no headings, no preamble, no markdown.
- Return ONLY the requested section's content as plain text (bullet lines, or a single paragraph for the takeaway). No labels, no JSON.`;

export async function generateOverviewSection(input: {
  property: string;
  period: string;
  section: OverviewSection;
  image?: GroqImage | null;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI is not configured — set GROQ_API_KEY on the server." };
  }
  try {
    // Inside the try so a transient DB error building the context returns a
    // clean error instead of throwing out of the action (which would strand the
    // modal on "Generating…").
    const context = await buildContext(input.property, input.period);
    if (!context) {
      return { ok: false, error: "No restaurant figures for this period yet — import the F&B data first." };
    }
    const user = `Restaurant context (JSON):\n${context}\n\n${SECTION_INSTRUCTION[input.section]}`;
    const raw = await groqChat({ system: SYSTEM, user, image: input.image ?? null, temperature: 0.2, maxTokens: 700 });
    const text = String(raw ?? "").trim();
    if (!text) return { ok: false, error: "The AI returned nothing — try again." };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI generation failed." };
  }
}
