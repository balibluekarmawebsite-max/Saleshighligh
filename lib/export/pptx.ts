import PptxGenJS from "pptxgenjs";

import { achievementPct, variancePct } from "@/lib/calculations";
import {
  getGuestsPageData,
  getMarketPageData,
  getMarketingPageData,
  getPlansPageData,
  getRestaurantPageData,
  getRoomTypesPageData,
  getSegmentsPageData,
  getSocialPageData,
  getSpaPageData,
  getSummaryPageData,
} from "@/lib/dashboard-data";
import {
  formatIDRCompact,
  formatNumber,
  formatPercent,
  formatRatioPct,
  formatVariancePercent,
} from "@/lib/format";
import { DECK_SECTIONS, DEFAULT_SECTION_IDS, type DeckSectionId } from "@/lib/export/sections";
import { periodLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export { DECK_SECTIONS, DEFAULT_SECTION_IDS } from "@/lib/export/sections";
export type { DeckSectionId } from "@/lib/export/sections";

/**
 * Server-side generator for the monthly "Sales Highlight" deck (Phase 14).
 * Clean professional template — white slides, deep-teal headers, a slim gold
 * accent, Calibri throughout, native tables and native charts (no decorative
 * bars). Every figure comes from the same fetchers the dashboard uses.
 */

type Pptx = InstanceType<typeof PptxGenJS>;
type Slide = ReturnType<Pptx["addSlide"]>;

const TEAL = "0F4C5C";
const GOLD = "C9A227";
const INK = "1F2937";
const MUTE = "6B7280";
const LINE = "E5E7EB";
const GREEN = "15803D";
const RED = "B91C1C";
const FONT = "Calibri";
const CW = 13.333;
const MX = 0.6;

// ── formatting ──────────────────────────────────────────────────────────────
const money = (n: number | null | undefined) => (n == null ? "—" : formatIDRCompact(n));
const num = (n: number | null | undefined) => (n == null ? "—" : formatNumber(n));
const pct = (n: number | null | undefined) => (n == null ? "—" : formatPercent(n));
const svar = (n: number | null | undefined) => (n == null ? "—" : formatVariancePercent(n));
const varColor = (n: number | null | undefined) => (n == null || n === 0 ? INK : n > 0 ? GREEN : RED);

// ── slide primitives ────────────────────────────────────────────────────────
type Cell = { text: string; options?: Record<string, unknown> };

function head(text: string, align: "left" | "right" | "center" = "left"): Cell {
  return { text, options: { fill: { color: TEAL }, color: "FFFFFF", bold: true, align, fontFace: FONT, fontSize: 10, valign: "middle" } };
}
function td(text: string, align: "left" | "right" | "center" = "left", color = INK): Cell {
  return { text, options: { align, color, fontFace: FONT, fontSize: 9.5, valign: "middle" } };
}

function slideHeader(pptx: Pptx, slide: Slide, title: string, subtitle?: string) {
  slide.background = { color: "FFFFFF" };
  slide.addText(title, { x: MX, y: 0.32, w: CW - 2 * MX, h: 0.5, fontFace: FONT, fontSize: 22, bold: true, color: TEAL });
  slide.addShape(pptx.ShapeType.rect, { x: MX, y: 0.92, w: 1.4, h: 0.035, fill: { color: GOLD }, line: { type: "none" } });
  if (subtitle) slide.addText(subtitle, { x: MX, y: 0.98, w: CW - 2 * MX, h: 0.3, fontFace: FONT, fontSize: 11, color: MUTE });
}

function contentSlide(pptx: Pptx, title: string, subtitle?: string): Slide {
  const slide = pptx.addSlide();
  slideHeader(pptx, slide, title, subtitle);
  return slide;
}

function addTable(slide: Slide, rows: Cell[][], y = 1.4, colW?: number[]) {
  slide.addTable(rows, {
    x: MX,
    y,
    w: CW - 2 * MX,
    colW,
    border: { type: "solid", color: LINE, pt: 0.5 },
    valign: "middle",
    fontFace: FONT,
    fontSize: 9.5,
    color: INK,
    autoPage: false,
  });
}

function addNarrative(slide: Slide, text: string | null, y = 1.45) {
  slide.addText(text && text.trim() ? text : "Not written for this period yet.", {
    x: MX,
    y,
    w: CW - 2 * MX,
    h: 7.5 - y - 0.4,
    fontFace: FONT,
    fontSize: 12,
    color: text && text.trim() ? INK : MUTE,
    align: "left",
    valign: "top",
    lineSpacingMultiple: 1.18,
  });
}

function noData(slide: Slide, message = "No data imported for this section yet.") {
  slide.addText(message, { x: MX, y: 3, w: CW - 2 * MX, h: 1, fontFace: FONT, fontSize: 13, color: MUTE, align: "center" });
}

function revenueBar(pptx: Pptx, slide: Slide, labels: string[], actual: number[], budget: number[], y = 3.2, h = 3.6) {
  slide.addChart(
    pptx.ChartType.bar,
    [
      { name: "Actual", labels, values: actual },
      { name: "Budget", labels, values: budget },
    ],
    {
      x: MX,
      y,
      w: CW - 2 * MX,
      h,
      barDir: "col",
      chartColors: [TEAL, GOLD],
      showLegend: true,
      legendPos: "b",
      legendFontFace: FONT,
      catAxisLabelFontFace: FONT,
      catAxisLabelFontSize: 9,
      valAxisLabelFontFace: FONT,
      valAxisLabelFontSize: 9,
      showValue: false,
    },
  );
}

// ── cover ───────────────────────────────────────────────────────────────────
function coverSlide(pptx: Pptx, property: { name: string; area: string }, period: string) {
  const slide = pptx.addSlide();
  slide.background = { color: "FFFFFF" };
  slide.addText("Sales Highlight", { x: MX, y: 2.5, w: CW - 2 * MX, h: 0.6, fontFace: FONT, fontSize: 20, color: GOLD, bold: true, charSpacing: 2 });
  slide.addText(property.name, { x: MX, y: 3.15, w: CW - 2 * MX, h: 1.1, fontFace: FONT, fontSize: 40, color: TEAL, bold: true });
  slide.addShape(pptx.ShapeType.rect, { x: MX, y: 4.35, w: 2.2, h: 0.045, fill: { color: GOLD }, line: { type: "none" } });
  slide.addText(`${periodLabel(period)}  ·  ${property.area}`, { x: MX, y: 4.55, w: CW - 2 * MX, h: 0.4, fontFace: FONT, fontSize: 16, color: INK });
  slide.addText("Blue Karma Group", { x: MX, y: 6.7, w: CW - 2 * MX, h: 0.35, fontFace: FONT, fontSize: 12, color: MUTE });
}

// ── section builders ─────────────────────────────────────────────────────────
async function summarySection(pptx: Pptx, code: string, period: string) {
  const d = await getSummaryPageData(code, period);
  const slide = contentSlide(pptx, "Executive Summary — Achievement vs Budget", periodLabel(period));
  if (!d || !d.hasData) return noData(slide);

  const rows: Cell[][] = [[head("Metric"), head("Actual", "right"), head("Budget", "right"), head("Last Year", "right"), head("Achievement", "right"), head("Variance", "right")]];
  for (const l of d.revenueLines) {
    const isRatio = l.format === "ratio";
    const ach = achievementPct(l.actual, l.budget);
    const varStr = isRatio ? `${(l.actual - l.budget) * 100 >= 0 ? "+" : ""}${((l.actual - l.budget) * 100).toFixed(2)} pts` : svar(variancePct(l.actual, l.budget));
    const varNum = isRatio ? (l.actual - l.budget) : variancePct(l.actual, l.budget);
    rows.push([
      td(l.label),
      td(isRatio ? formatRatioPct(l.actual) : money(l.actual), "right"),
      td(isRatio ? formatRatioPct(l.budget) : money(l.budget), "right"),
      td(l.lastYear == null ? "—" : isRatio ? formatRatioPct(l.lastYear) : money(l.lastYear), "right"),
      td(pct(ach), "right"),
      td(varStr, "right", varColor(varNum)),
    ]);
  }
  addTable(slide, rows);

  const nar = contentSlide(pptx, "Executive Summary — Narrative", periodLabel(period));
  addNarrative(nar, d.narratives.summary?.content ?? null);
}

async function factorsSection(pptx: Pptx, code: string, period: string) {
  const d = await getSummaryPageData(code, period);
  const ext = contentSlide(pptx, "External Factors", periodLabel(period));
  addNarrative(ext, d?.narratives.external?.content ?? null);
  const int = contentSlide(pptx, "Internal Factors", periodLabel(period));
  addNarrative(int, d?.narratives.internal?.content ?? null);
}

async function roomsSection(pptx: Pptx, code: string, period: string) {
  for (const scope of ["MTD", "YTD"] as const) {
    const d = await getSegmentsPageData(code, period, scope);
    const slide = contentSlide(pptx, `Market Segment — ${scope}`, periodLabel(period));
    if (!d || !d.hasData || d.segments.length === 0) {
      noData(slide);
    } else {
      const rows: Cell[][] = [[head("Segment"), head("RN Act", "right"), head("RN Bud", "right"), head("ARR Act", "right"), head("Rev Act", "right"), head("Rev Bud", "right"), head("Ach %", "right")]];
      for (const s of d.segments.slice(0, 10)) {
        rows.push([
          td(s.name),
          td(num(s.actual.rn), "right"),
          td(num(s.budget.rn), "right"),
          td(money(s.actual.arr), "right"),
          td(money(s.actual.revenue), "right"),
          td(money(s.budget.revenue), "right"),
          td(pct(achievementPct(s.actual.revenue, s.budget.revenue)), "right"),
        ]);
      }
      rows.push([
        td("TOTAL"),
        td(num(d.totals.actual.rn), "right"),
        td(num(d.totals.budget.rn), "right"),
        td(money(d.totals.actual.arr), "right"),
        td(money(d.totals.actual.revenue), "right"),
        td(money(d.totals.budget.revenue), "right"),
        td(pct(achievementPct(d.totals.actual.revenue, d.totals.budget.revenue)), "right"),
      ]);
      addTable(slide, rows);
    }
  }

  // Account production (YTD)
  const seg = await getSegmentsPageData(code, period, "YTD");
  const accSlide = contentSlide(pptx, "Account Production", periodLabel(period));
  if (seg && seg.accounts.length > 0) {
    const rows: Cell[][] = [[head("#"), head("Account"), head("Type"), head("Room Nights", "right"), head("Revenue", "right"), head("% of Rev", "right")]];
    for (const a of seg.accounts.slice(0, 14)) {
      rows.push([td(String(a.rank)), td(a.accountName), td(a.accountType), td(num(a.roomNights), "right"), td(money(a.revenue), "right"), td(`${a.pctOfRevenue.toFixed(1)}%`, "right")]);
    }
    addTable(accSlide, rows);
  } else noData(accSlide);

  // Room types
  const rt = await getRoomTypesPageData(code, period);
  const rtSlide = contentSlide(pptx, "Room Type Analytics", periodLabel(period));
  if (rt && rt.hasData && rt.roomTypes.length > 0) {
    const rows: Cell[][] = [[head("Room Type"), head("RN Act", "right"), head("RN Bud", "right"), head("ADR Act", "right"), head("ADR Bud", "right"), head("Rev Act", "right"), head("Ach %", "right")]];
    for (const r of rt.roomTypes.slice(0, 12)) {
      rows.push([
        td(r.roomTypeName),
        td(num(r.roomNightsActual), "right"),
        td(num(r.roomNightsBudget), "right"),
        td(money(r.adrActual), "right"),
        td(money(r.adrBudget), "right"),
        td(money(r.revenueActual), "right"),
        td(pct(achievementPct(r.revenueActual, r.revenueBudget)), "right"),
      ]);
    }
    addTable(rtSlide, rows);
    const nar = contentSlide(pptx, "Room Type Analysis", periodLabel(period));
    addNarrative(nar, rt.narrative?.content ?? null);
  } else noData(rtSlide);

  // Guests: nationality + LOS
  const g = await getGuestsPageData(code, period);
  const nSlide = contentSlide(pptx, "Nationality & Length of Stay", periodLabel(period));
  if (g && g.hasData && (g.nationalities.length > 0 || g.losBuckets.length > 0)) {
    const rows: Cell[][] = [[head("#"), head("Nationality"), head("Room Nights", "right"), head("Share", "right"), head("vs LY RN", "right")]];
    for (const n of g.nationalities.slice(0, 10)) {
      rows.push([td(String(n.rank)), td(n.countryName), td(num(n.roomNights), "right"), td(`${n.sharePct.toFixed(1)}%`, "right"), td(n.lastYearRoomNights == null ? "—" : num(n.lastYearRoomNights), "right")]);
    }
    addTable(nSlide, rows, 1.4, [0.6, 4.2, 2.5, 2.4, 2.4]);
    const losRows: Cell[][] = [[head("LOS (nights)"), head("Bookings", "right"), head("Room Nights", "right"), head("Share", "right")]];
    for (const l of g.losBuckets) losRows.push([td(l.bucket), td(num(l.bookings), "right"), td(num(l.roomNights), "right"), td(`${l.sharePct.toFixed(1)}%`, "right")]);
    nSlide.addText(`Average LOS: ${g.avgLos != null ? g.avgLos.toFixed(2) : "—"} nights  ·  3+ nights: ${g.share3Plus != null ? g.share3Plus.toFixed(1) : "—"}%`, { x: MX, y: 5.1, w: CW - 2 * MX, h: 0.3, fontFace: FONT, fontSize: 10, color: MUTE });
    addTable(nSlide, losRows, 5.45);
  } else noData(nSlide);
}

async function marketingSection(pptx: Pptx, code: string, period: string) {
  const d = await getMarketingPageData(code, period);
  const adsSlide = contentSlide(pptx, "Digital Ads & ROAS", periodLabel(period));
  if (d && d.hasData && d.ads) {
    const a = d.ads;
    adsSlide.addText(
      [
        { text: `Spend ${money(a.totalSpend)}    `, options: { bold: true, color: TEAL } },
        { text: `Tracked Revenue ${money(a.trackedRevenue)}    `, options: { bold: true, color: TEAL } },
        { text: `ROAS ${a.roasPct != null ? a.roasPct.toFixed(0) + "%" : "—"}    `, options: { bold: true, color: GOLD } },
        { text: `Clicks ${num(a.totalClicks)}`, options: { bold: true, color: TEAL } },
      ],
      { x: MX, y: 1.4, w: CW - 2 * MX, h: 0.4, fontFace: FONT, fontSize: 12 },
    );
    const rows: Cell[][] = [[head("Platform"), head("Spend", "right"), head("Impr.", "right"), head("Clicks", "right"), head("CTR", "right"), head("CPC", "right"), head("Revenue", "right")]];
    for (const p of a.platforms) {
      rows.push([td(p.platform), td(money(p.spend), "right"), td(num(p.impressions), "right"), td(num(p.clicks), "right"), td(p.ctr != null ? formatPercent(p.ctr) : "—", "right"), td(money(p.cpc), "right"), td(money(p.trackedRevenue), "right")]);
    }
    addTable(adsSlide, rows, 2.0);
  } else noData(adsSlide, "No ad data for this period.");

  const repSlide = contentSlide(pptx, "Online Reputation — OTA & Tripadvisor", periodLabel(period));
  if (d && d.hasData && (d.rankCards.length > 0 || d.tripadvisor)) {
    const rows: Cell[][] = [[head("Platform"), head("Rank", "right"), head("Of", "right"), head("MoM Change", "right")]];
    for (const r of d.rankCards) {
      rows.push([td(r.platform), td(r.rank != null ? `#${r.rank}` : "—", "right"), td(r.totalInMarket != null ? num(r.totalInMarket) : "—", "right"), td(r.change == null ? "—" : `${r.change > 0 ? "+" + r.change + " improved" : r.change < 0 ? r.change + " dropped" : "no change"}`, "right", varColor(r.change))]);
    }
    addTable(repSlide, rows, 1.5);
    if (d.tripadvisor) {
      const t = d.tripadvisor;
      repSlide.addText(`Tripadvisor: ${t.rank != null ? "#" + t.rank : "—"}${t.totalInMarket != null ? " of " + num(t.totalInMarket) : ""} in ${t.area}${t.rating != null ? "  ·  " + t.rating.toFixed(1) + "/5" : ""}`, { x: MX, y: 3.7, w: CW - 2 * MX, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: TEAL });
      const trows: Cell[][] = [[head("Metric"), head("Value", "right"), head("MoM", "right")]];
      for (const m of t.metrics) trows.push([td(m.label), td(num(m.value), "right"), td(m.mom != null ? svar(m.mom) : "—", "right", varColor(m.mom))]);
      addTable(repSlide, trows, 4.1);
    }
  } else noData(repSlide);
}

async function restaurantSection(pptx: Pptx, code: string, period: string) {
  const d = await getRestaurantPageData(code, period);
  const title = d?.property.restaurantName ?? "Restaurant";
  const ov = contentSlide(pptx, `${title} — Overview`, periodLabel(period));
  if (!d || !d.hasData) return noData(ov);

  if (d.overview) {
    ov.addText(
      [
        { text: `Covers ${num(d.overview.covers.actual)} / ${num(d.overview.covers.budget)} bud    `, options: { color: TEAL, bold: true } },
        { text: `Revenue ${money(d.overview.revenue.actual)}    `, options: { color: TEAL, bold: true } },
        { text: `Avg Check ${money(d.overview.avgCheckActual)}    `, options: { color: GOLD, bold: true } },
        { text: `Rev Ach ${pct(d.overview.revenueAchievementPct)}`, options: { color: TEAL, bold: true } },
      ],
      { x: MX, y: 1.4, w: CW - 2 * MX, h: 0.4, fontFace: FONT, fontSize: 12 },
    );
  }
  if (d.meals.length > 0) {
    const rows: Cell[][] = [[head("Meal"), head("Covers Act", "right"), head("Avg Check", "right"), head("Rev Act", "right"), head("Rev Bud", "right"), head("% of Rev", "right")]];
    for (const m of d.meals) rows.push([td(m.meal), td(num(m.coversActual), "right"), td(money(m.avgCheckActual), "right"), td(money(m.revenueActual), "right"), td(money(m.revenueBudget), "right"), td(`${m.pctOfRevenue.toFixed(1)}%`, "right")]);
    addTable(ov, rows, 2.0);
    revenueBar(pptx, ov, d.meals.map((m) => m.meal), d.meals.map((m) => m.revenueActual), d.meals.map((m) => m.revenueBudget), 4.2, 2.9);
  }

  // Sources + Chope + Gokai
  const sob = contentSlide(pptx, `${title} — Source of Booking & Chope`, periodLabel(period));
  if (d.sources.length > 0) {
    const rows: Cell[][] = [[head("Source"), head("Type"), head("Persons", "right"), head("Avg Check", "right"), head("Revenue", "right")]];
    for (const s of d.sources.slice(0, 10)) rows.push([td(s.sourceName), td(s.category), td(num(s.persons), "right"), td(money(s.avgCheck), "right"), td(money(s.revenue), "right")]);
    addTable(sob, rows, 1.45);
  }
  if (d.chope) {
    sob.addText(
      `Chope — Fulfilled ${num(d.chope.fulfilledBookings)} bookings / ${num(d.chope.fulfilledCovers)} covers  ·  Cancelled ${num(d.chope.cancelledBookings)}  ·  No-shows ${num(d.chope.noShows)}  ·  Revenue ${money(d.chope.revenue)}${d.chope.pctOfRestaurantRevenue != null ? " (" + d.chope.pctOfRestaurantRevenue.toFixed(1) + "% of restaurant)" : ""}`,
      { x: MX, y: 5.7, w: CW - 2 * MX, h: 0.8, fontFace: FONT, fontSize: 10, color: INK, valign: "top" },
    );
  }
  if (d.gokai) {
    const gk = contentSlide(pptx, `${title} — Gokai CRM`, periodLabel(period));
    const rows: Cell[][] = [[head("Metric"), head("Value", "right"), head("MoM", "right")]];
    for (const m of d.gokai.metrics) rows.push([td(m.label), td(m.format === "idr" ? money(m.value) : m.format === "pct" ? formatPercent(m.value) : num(m.value), "right"), td(m.mom != null ? svar(m.mom) : "—", "right", varColor(m.mom))]);
    addTable(gk, rows, 1.5);
  }

  const nar = contentSlide(pptx, `${title} — Overview Narrative`, periodLabel(period));
  addNarrative(nar, d.narrative?.content ?? null);
}

async function spaSection(pptx: Pptx, code: string, period: string) {
  const d = await getSpaPageData(code, period);
  const title = d?.property.spaName ?? "Spa & Wellness";
  const ov = contentSlide(pptx, `${title} — Guest Segments`, periodLabel(period));
  if (!d || !d.hasData) return noData(ov);

  const SEG: Record<string, string> = { IN_HOUSE: "In-House", OUTSIDE: "Outside", INCLUSION: "Inclusion" };
  if (d.segments.length > 0) {
    const rows: Cell[][] = [[head("Segment"), head("Covers Act", "right"), head("Avg Check", "right"), head("Rev Act", "right"), head("Rev Bud", "right"), head("Ach %", "right")]];
    for (const s of d.segments) rows.push([td(SEG[s.segment] ?? s.segment), td(num(s.coversActual), "right"), td(money(s.avgCheckActual), "right"), td(money(s.revenueActual), "right"), td(money(s.revenueBudget), "right"), td(pct(achievementPct(s.revenueActual, s.revenueBudget)), "right")]);
    addTable(ov, rows, 1.5);
    revenueBar(pptx, ov, d.segments.map((s) => SEG[s.segment] ?? s.segment), d.segments.map((s) => s.revenueActual), d.segments.map((s) => s.revenueBudget), 3.7, 3.2);
  }

  const tr = contentSlide(pptx, `${title} — Top Treatments & Gokai`, periodLabel(period));
  if (d.treatments.length > 0) {
    const rows: Cell[][] = [[head("#"), head("Treatment"), head("Count", "right"), head("Revenue", "right"), head("Avg Price", "right")]];
    for (const t of d.treatments) rows.push([td(String(t.rank)), td(t.treatmentName), td(num(t.count), "right"), td(money(t.revenue), "right"), td(money(t.avgPrice), "right")]);
    addTable(tr, rows, 1.45);
  }
  if (d.gokai) {
    const rows: Cell[][] = [[head("Gokai Metric"), head("Value", "right"), head("MoM", "right")]];
    for (const m of d.gokai.metrics) rows.push([td(m.label), td(m.format === "idr" ? money(m.value) : m.format === "pct" ? formatPercent(m.value) : num(m.value), "right"), td(m.mom != null ? svar(m.mom) : "—", "right", varColor(m.mom))]);
    addTable(tr, rows, 5.0);
  }

  const nar = contentSlide(pptx, `${title} — Overview Narrative`, periodLabel(period));
  addNarrative(nar, d.narrative?.content ?? null);
}

async function marketSection(pptx: Pptx, code: string, period: string) {
  const d = await getMarketPageData(code, period);
  const pace = contentSlide(pptx, "Booking Pace / On the Books", d?.paceAsOf ? `Data as of ${new Date(d.paceAsOf).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : periodLabel(period));
  if (d && d.pace.length > 0) {
    const rows: Cell[][] = [[head("Target Month"), head("Prev OTB", "right"), head("OTB Today", "right"), head("Pickup", "right"), head("Market Demand", "right"), head("Note")]];
    for (const p of d.pace) rows.push([td(periodLabel(p.targetMonth)), td(p.prevOcc != null ? p.prevOcc.toFixed(0) + "%" : "—", "right"), td(p.otbOcc.toFixed(0) + "%", "right"), td(p.pickup != null ? `${p.pickup >= 0 ? "+" : ""}${p.pickup.toFixed(1)} pts` : "—", "right", varColor(p.pickup)), td(p.marketDemand != null ? p.marketDemand.toFixed(0) + "%" : "—", "right"), td(p.note || "—")]);
    addTable(pace, rows, 1.5);
  } else noData(pace);

  const fc = contentSlide(pptx, "6-Month Forecast", periodLabel(period));
  if (d && d.forecasts.length > 0) {
    const rows: Cell[][] = [[head("Month"), head("Forecast Occ", "right"), head("Last Year", "right"), head("Market Demand", "right")]];
    for (const f of d.forecasts) rows.push([td(periodLabel(f.month)), td(f.forecastOcc != null ? f.forecastOcc.toFixed(1) + "%" : "—", "right"), td(f.lastYearOcc != null ? f.lastYearOcc.toFixed(1) + "%" : "—", "right"), td(f.marketDemand != null ? f.marketDemand.toFixed(1) + "%" : "—", "right")]);
    addTable(fc, rows, 1.45);
    if (d.revenueForecast.length > 0) {
      const rrows: Cell[][] = [[head("Month"), head("Forecast Rev", "right"), head("Budget Rev", "right"), head("Gap", "right"), head("Cumulative", "right")]];
      for (const r of d.revenueForecast) rrows.push([td(periodLabel(r.month)), td(money(r.forecastRevenue), "right"), td(money(r.budgetRevenue), "right"), td(r.gap != null ? money(r.gap) : "—", "right", varColor(r.gap)), td(r.cumulativeGap != null ? money(r.cumulativeGap) : "—", "right", varColor(r.cumulativeGap))]);
      addTable(fc, rrows, 4.4);
    }
  } else noData(fc);

  const upd = contentSlide(pptx, "Market Update", periodLabel(period));
  addNarrative(upd, d?.narrative?.content ?? null);
}

async function plansSection(pptx: Pptx, code: string, period: string) {
  const d = await getPlansPageData(code, period);
  const order: { id: string; label: string }[] = [
    { id: "ACTION_PLAN", label: "Sales & Marketing Action Plan" },
    { id: "SALES_STRATEGY", label: "Sales Strategy per Segment" },
    { id: "MARKETING_PLAN", label: "Marketing Plan" },
    { id: "SOCIAL_PLAN", label: "Social Media Plan" },
    { id: "CONSORTIA", label: "Consortia & Partners" },
    { id: "MAGAZINE", label: "Magazine" },
    { id: "PR", label: "Media Features & PR" },
    { id: "PROMOTIONS", label: "Ongoing Promotions" },
  ];
  for (const o of order) {
    const slide = contentSlide(pptx, o.label, periodLabel(period));
    addNarrative(slide, d?.sections[o.id]?.current?.content ?? null);
  }
}

async function socialSection(pptx: Pptx, code: string, period: string) {
  const d = await getSocialPageData(code, period);
  const UNIT: Record<string, string> = { HOTEL: "Hotel", RESTAURANT: "Restaurant", SPA: "Spa" };
  const slide = contentSlide(pptx, "Social Media Reports", periodLabel(period));
  if (d && d.units.some((u) => u.hasData)) {
    const rows: Cell[][] = [[head("Unit · Platform"), head("Impr.", "right"), head("Reach", "right"), head("Interactions", "right"), head("Followers", "right")]];
    for (const u of d.units.filter((x) => x.hasData)) {
      for (const p of u.platforms.filter((x) => x.hasData)) {
        const m = (k: string) => p.metrics.find((x) => x.key === k)?.value ?? null;
        rows.push([td(`${UNIT[u.unit] ?? u.unit} · ${p.platform}`), td(num(m("impressions")), "right"), td(num(m("reach")), "right"), td(num(m("interactions")), "right"), td(num(m("followersGained")), "right")]);
      }
    }
    addTable(slide, rows, 1.45);
  } else noData(slide);

  const inf = contentSlide(pptx, "Influencer Collaborations", periodLabel(period));
  if (d && d.influencers.length > 0) {
    const rows: Cell[][] = [[head("Handle"), head("Name"), head("Followers", "right"), head("Origin"), head("Notes")]];
    for (const i of d.influencers) rows.push([td(i.handle), td(i.name), td(num(i.followers), "right"), td(i.origin), td(i.notes ?? "—")]);
    addTable(inf, rows, 1.45);
  } else noData(inf, "No influencer collaborations recorded for this period.");
}

const BUILDERS: Record<DeckSectionId, (pptx: Pptx, code: string, period: string) => Promise<void>> = {
  summary: summarySection,
  factors: factorsSection,
  rooms: roomsSection,
  marketing: marketingSection,
  restaurant: restaurantSection,
  spa: spaSection,
  market: marketSection,
  plans: plansSection,
  social: socialSection,
};

export interface DeckResult {
  buffer: Buffer;
  fileName: string;
}

/** Build the Sales Highlight deck for one property/period. Returns a .pptx buffer. */
export async function buildDeck(propertyCode: string, period: string, sectionIds: DeckSectionId[]): Promise<DeckResult | null> {
  const property = await prisma.property.findUnique({
    where: { code: propertyCode },
    select: { code: true, name: true, area: true },
  });
  if (!property) return null;

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "BK", width: CW, height: 7.5 });
  pptx.layout = "BK";
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  pptx.author = "BK Sales Dashboard";
  pptx.company = "Blue Karma Group";
  pptx.title = `${property.name} — Sales Highlight ${periodLabel(period)}`;

  coverSlide(pptx, property, period);
  const selected = sectionIds.length ? sectionIds : DEFAULT_SECTION_IDS;
  for (const s of DECK_SECTIONS) {
    if (selected.includes(s.id)) await BUILDERS[s.id](pptx, propertyCode, period);
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return { buffer, fileName: `${property.code}-${period}-sales-highlight.pptx` };
}
