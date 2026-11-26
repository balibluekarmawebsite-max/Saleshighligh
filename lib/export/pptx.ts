import { existsSync, readFileSync } from "node:fs";

import PptxGenJS from "pptxgenjs";

import { achievementPct, avgCheck, momChange, variancePct } from "@/lib/calculations";
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
  type AdsSummary,
  type SojernChartRow,
  type TripadvisorSummary,
} from "@/lib/dashboard-data";
import { segmentLabel } from "@/lib/sales/account-segments";
import { RANKING_PLATFORM_LABEL } from "@/lib/sales/ota-ranking-logic";
import { overviewContentToText } from "@/lib/sales/restaurant-overview";
import { buildSalesTable } from "@/lib/sales/restaurant-sales-table";
import {
  formatIDR,
  formatNumber,
  formatPercent,
  formatRatioPct,
  formatVariancePercent,
} from "@/lib/format";
import { DECK_SECTIONS, DEFAULT_SECTION_IDS, type DeckSectionId } from "@/lib/export/sections";
import { periodLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { storagePath } from "@/lib/storage";

export { DECK_SECTIONS, DEFAULT_SECTION_IDS } from "@/lib/export/sections";
export type { DeckSectionId } from "@/lib/export/sections";

/**
 * Server-side generator for the monthly "Sales Highlight" deck (Phase 14).
 * Clean professional template — white slides, deep-teal headers, a slim gold
 * accent, Calibri throughout, native tables and native charts. Every figure
 * comes from the same fetchers the dashboard uses, and the deck is kept a
 * faithful copy of the dashboard: the same data, the same labels, nothing the
 * dashboard does not show.
 */

type Pptx = InstanceType<typeof PptxGenJS>;
type Slide = ReturnType<Pptx["addSlide"]>;

const TEAL = "0F4C5C";
const GOLD = "C9A227";
const LTTEAL = "9CC3D0"; // light teal — "market" comparison series
const ORANGE = "E8833A"; // ADR / line accent
const INK = "1F2937";
const MUTE = "6B7280";
const LINE = "E5E7EB";
const GREEN = "15803D";
const RED = "B91C1C";
const FONT = "Calibri";
const CW = 13.333;
const MX = 0.6;
const CONTENT_W = CW - 2 * MX;
const DOUGHNUT_COLORS = [TEAL, GOLD, LTTEAL, ORANGE, "2F6FBF", MUTE, "8E6FB0"];

// Human display labels (match the dashboard, never raw enum codes).
const ADS_LABEL: Record<string, string> = { GOOGLE: "Google", META: "Meta", OPENAI: "OpenAI", CORPORATE: "Corporate" };
const adsLabel = (p: string) => ADS_LABEL[p] ?? p;
const rankLabel = (p: string) => (RANKING_PLATFORM_LABEL as Record<string, string>)[p] ?? p;

// ── formatting ──────────────────────────────────────────────────────────────
// Full IDR numbers with thousand separators (e.g. "Rp 4,600,000,000") — the
// report quotes complete figures, not compact "Rp 4.6 B".
const money = (n: number | null | undefined) => (n == null ? "—" : formatIDR(n));
const num = (n: number | null | undefined) => (n == null ? "—" : formatNumber(n));
const pct = (n: number | null | undefined) => (n == null ? "—" : formatPercent(n));
const svar = (n: number | null | undefined) => (n == null ? "—" : formatVariancePercent(n));
const varColor = (n: number | null | undefined) => (n == null || n === 0 ? INK : n > 0 ? GREEN : RED);
const sharePct = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(1)}%`);

// ── slide primitives ────────────────────────────────────────────────────────
type Cell = { text: string; options?: Record<string, unknown> };

function head(text: string, align: "left" | "right" | "center" = "left", size = 10): Cell {
  return { text, options: { fill: { color: TEAL }, color: "FFFFFF", bold: true, align, fontFace: FONT, fontSize: size, valign: "middle" } };
}
function td(text: string, align: "left" | "right" | "center" = "left", color = INK, size = 9.5): Cell {
  return { text, options: { align, color, fontFace: FONT, fontSize: size, valign: "middle" } };
}
/** A TOTAL / footer cell — gold-tinted fill + bold, so it reads as a summary row. */
function totalCell(text: string, align: "left" | "right" | "center" = "left", color = TEAL, size = 9.5): Cell {
  return { text, options: { align, color, bold: true, fontFace: FONT, fontSize: size, valign: "middle", fill: { color: "FBF4DE" } } };
}

/** Define the per-deck slide master used by every content slide: a slim teal
 *  top band, a footer rule with the deck's property/period, and a page number. */
function defineMasters(pptx: Pptx, footer: string) {
  pptx.defineSlideMaster({
    title: "BK_CONTENT",
    background: { color: "FFFFFF" },
    objects: [
      { rect: { x: 0, y: 0, w: CW, h: 0.1, fill: { color: TEAL }, line: { type: "none" } } },
      { rect: { x: MX, y: 7.12, w: CONTENT_W, h: 0.012, fill: { color: LINE }, line: { type: "none" } } },
      {
        text: {
          text: footer,
          options: { x: MX, y: 7.14, w: CONTENT_W - 1.1, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTE, align: "left", valign: "middle" },
        },
      },
    ],
    slideNumber: { x: CW - MX - 1, y: 7.14, w: 1, h: 0.3, fontFace: FONT, fontSize: 8, color: MUTE, align: "right" },
  });
}

function slideHeader(pptx: Pptx, slide: Slide, title: string, subtitle?: string) {
  slide.addText(title, { x: MX, y: 0.34, w: CONTENT_W, h: 0.52, fontFace: FONT, fontSize: 22, bold: true, color: TEAL });
  slide.addShape(pptx.ShapeType.rect, { x: MX, y: 0.94, w: 1.4, h: 0.035, fill: { color: GOLD }, line: { type: "none" } });
  if (subtitle) slide.addText(subtitle, { x: MX, y: 1.0, w: CONTENT_W, h: 0.3, fontFace: FONT, fontSize: 11, color: MUTE });
}

function contentSlide(pptx: Pptx, title: string, subtitle?: string): Slide {
  const slide = pptx.addSlide({ masterName: "BK_CONTENT" });
  slideHeader(pptx, slide, title, subtitle);
  return slide;
}

/** A full-bleed teal section divider: big gold section number + white title. */
function dividerSlide(pptx: Pptx, index: number, label: string) {
  const slide = pptx.addSlide();
  slide.background = { color: TEAL };
  slide.addText(String(index).padStart(2, "0"), { x: MX, y: 2.45, w: 3, h: 1.2, fontFace: FONT, fontSize: 54, bold: true, color: GOLD });
  slide.addShape(pptx.ShapeType.rect, { x: MX + 0.03, y: 3.95, w: 1.7, h: 0.05, fill: { color: GOLD }, line: { type: "none" } });
  slide.addText(label, { x: MX, y: 4.12, w: CONTENT_W, h: 1.1, fontFace: FONT, fontSize: 34, bold: true, color: "FFFFFF" });
  slide.addText("Blue Karma Group  —  Sales Highlight", { x: MX, y: 6.9, w: 8, h: 0.3, fontFace: FONT, fontSize: 9, color: "9FB7BE" });
}

const ZEBRA = "F3F6F7";
function addTable(slide: Slide, rows: Cell[][], y = 1.4, colW?: number[], fs = 9.5) {
  // Zebra-stripe the body rows (row 0 is the teal header) for readability, without
  // overriding a cell that already sets its own fill (e.g. a TOTAL row).
  const striped = rows.map((row, i) =>
    i > 0 && i % 2 === 0
      ? row.map((c) => ({ ...c, options: { ...c.options, fill: c.options?.fill ?? { color: ZEBRA } } }))
      : row,
  );
  slide.addTable(striped, {
    x: MX,
    y,
    w: CONTENT_W,
    colW,
    border: { type: "solid", color: LINE, pt: 0.5 },
    valign: "middle",
    fontFace: FONT,
    fontSize: fs,
    color: INK,
    autoPage: false,
  });
}

/**
 * Emit `body` rows across as many slides as needed (repeating `header` and the
 * slide title), so a long dashboard table (accounts, nationalities, rank
 * history) is never truncated in the deck.
 */
function paginatedTable(
  pptx: Pptx,
  title: string,
  period: string,
  header: Cell[],
  body: Cell[][],
  perPage: number,
  colW?: number[],
  fs = 9.5,
) {
  if (body.length === 0) {
    noData(contentSlide(pptx, title, periodLabel(period)));
    return;
  }
  const pages = Math.ceil(body.length / perPage);
  for (let p = 0; p < pages; p += 1) {
    const slide = contentSlide(pptx, pages > 1 ? `${title} (${p + 1}/${pages})` : title, periodLabel(period));
    addTable(slide, [header, ...body.slice(p * perPage, (p + 1) * perPage)], 1.4, colW, fs);
  }
}

function addNarrative(slide: Slide, text: string | null, emptyText = "Not written for this period yet.", y = 1.45) {
  const has = !!(text && text.trim());
  slide.addText(has ? text! : emptyText, {
    x: MX,
    y,
    w: CONTENT_W,
    h: 6.95 - y,
    fontFace: FONT,
    fontSize: 12,
    color: has ? INK : MUTE,
    align: "left",
    valign: "top",
    lineSpacingMultiple: 1.18,
  });
}

/** A standalone narrative slide, only when there is content to show. */
function narrativeSlide(pptx: Pptx, title: string, period: string, text: string | null | undefined) {
  if (text && text.trim()) addNarrative(contentSlide(pptx, title, periodLabel(period)), text);
}

function noData(slide: Slide, message = "No data imported for this section yet.") {
  slide.addText(message, { x: MX, y: 3, w: CONTENT_W, h: 1, fontFace: FONT, fontSize: 13, color: MUTE, align: "center" });
}

/** A small caption line under the header (e.g. insight chips, status). */
function caption(slide: Slide, text: string, y: number, color = MUTE) {
  slide.addText(text, { x: MX, y, w: CONTENT_W, h: 0.3, fontFace: FONT, fontSize: 10, color, valign: "middle" });
}

function revenueBar(pptx: Pptx, slide: Slide, labels: string[], actual: number[], budget: number[], y = 3.2, h = 3.6) {
  slide.addChart(
    pptx.ChartType.bar,
    [
      { name: "Actual", labels, values: actual },
      { name: "Budget", labels, values: budget },
    ],
    {
      x: MX, y, w: CONTENT_W, h, barDir: "col", chartColors: [TEAL, GOLD], showLegend: true, legendPos: "b",
      legendFontFace: FONT, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 9, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 9, showValue: false,
    },
  );
}

/** A grouped column chart with any number of series. */
function groupedBarN(
  pptx: Pptx,
  slide: Slide,
  labels: string[],
  series: { name: string; values: number[] }[],
  y: number,
  h: number,
  colors: string[] = [TEAL, GOLD, LTTEAL],
) {
  slide.addChart(
    pptx.ChartType.bar,
    series.map((s) => ({ name: s.name, labels, values: s.values })),
    {
      x: MX, y, w: CONTENT_W, h, barDir: "col", chartColors: colors, showLegend: true, legendPos: "b",
      legendFontFace: FONT, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 9, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 9, showValue: false,
    },
  );
}
function groupedBar(
  pptx: Pptx, slide: Slide, labels: string[], s1: string, v1: number[], s2: string, v2: number[],
  y: number, h: number, colors: string[] = [TEAL, GOLD],
) {
  groupedBarN(pptx, slide, labels, [{ name: s1, values: v1 }, { name: s2, values: v2 }], y, h, colors);
}

/** A multi-series line chart (nulls render as gaps). `invert` flips the value
 *  axis (used for OTA rank trends, where a lower number is better). */
function lineChart(
  pptx: Pptx,
  slide: Slide,
  labels: string[],
  series: { name: string; values: (number | null)[] }[],
  y: number,
  h: number,
  colors: string[] = [TEAL, GOLD, ORANGE, LTTEAL, "2F6FBF", "6B7280"],
  invert = false,
) {
  slide.addChart(
    pptx.ChartType.line,
    series.map((s) => ({ name: s.name, labels, values: s.values })),
    {
      x: MX, y, w: CONTENT_W, h, chartColors: colors, showLegend: true, legendPos: "b",
      legendFontFace: FONT, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 9, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 9,
      lineDataSymbol: "circle", lineSize: 2, lineDataSymbolSize: 5,
      // pptxgenjs supports "maxMin" at runtime (invert the axis so a lower rank
      // sits higher) but types it too narrowly — cast the literal.
      ...(invert ? { valAxisOrientation: "maxMin" as "minMax" } : {}),
    },
  );
}

/** A doughnut (share-of-total) chart with a side legend + % labels. */
function doughnut(pptx: Pptx, slide: Slide, title: string, labels: string[], values: number[], x: number, y: number, w: number, h: number) {
  slide.addText(title, { x, y, w, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
  slide.addChart(pptx.ChartType.doughnut, [{ name: title, labels, values }], {
    x, y: y + 0.3, w, h: h - 0.3, holeSize: 58, chartColors: DOUGHNUT_COLORS,
    showLegend: true, legendPos: "r", legendFontFace: FONT, legendFontSize: 9,
    showValue: false, showPercent: true, dataLabelColor: "FFFFFF", dataLabelFontFace: FONT, dataLabelFontSize: 9,
  });
}

/**
 * Flow a long narrative into two side-by-side columns within a box. Paragraph
 * blocks (separated by blank lines) are distributed between the columns balanced
 * by length; a single-block text falls back to splitting on line breaks.
 */
function twoColumnText(slide: Slide, text: string, x: number, y: number, w: number, h: number, maxFont = 9) {
  const gap = 0.35;
  const colW = (w - gap) / 2;
  const sep = /\n\s*\n/.test(text) ? "\n\n" : "\n";
  const blocks = text.split(sep === "\n\n" ? /\n\s*\n/ : /\n/).map((b) => b.replace(/\s+$/, "")).filter((b) => b.trim());
  // Pick the split point that most evenly balances the two columns by weight
  // (block length + a per-block constant for its heading/spacing cost), so one
  // column never overflows while the other sits half-empty.
  const weights = blocks.map((b) => b.length + 24);
  const totalW = weights.reduce((s, n) => s + n, 0);
  let leftW = 0;
  let split = blocks.length;
  let bestDiff = Infinity;
  for (let i = 1; i < blocks.length; i += 1) {
    leftW += weights[i - 1]!;
    const diff = Math.abs(leftW - (totalW - leftW));
    if (diff < bestDiff) { bestDiff = diff; split = i; }
  }
  const left = blocks.slice(0, split).join(sep);
  const right = blocks.slice(split).join(sep);
  // Auto-fit: shrink the font so the taller column's lines fit the box height,
  // counting an extra wrapped line for any that overruns a column's width.
  const CPL = Math.max(10, Math.floor(colW / 0.062)); // ~chars per line at ~9pt
  const linesOf = (s: string) => s.split("\n").reduce((n, ln) => n + Math.max(1, Math.ceil(ln.length / CPL)), 0);
  const colLines = Math.max(linesOf(left), linesOf(right), 1);
  let font = Math.min(maxFont, (h / colLines) * 72 / 1.16);
  font = Math.max(7, Math.floor(font * 2) / 2); // round down to 0.5, floor 7pt
  const opts = { fontFace: FONT, fontSize: font, color: INK, align: "left" as const, valign: "top" as const, lineSpacingMultiple: 1.06 };
  slide.addText(left, { x, y, w: colW, h, ...opts });
  if (right.trim()) slide.addText(right, { x: x + colW + gap, y, w: colW, h, ...opts });
}

/** Read a stored upload (by its /uploads/<key> URL) as a base64 data URI for
 *  embedding. Returns null when the URL isn't a local upload or the file is gone. */
function imageData(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const base = (process.env.UPLOAD_URL_BASE ?? "/uploads").replace(/\/+$/, "");
  const prefix = `${base}/`;
  if (!imageUrl.startsWith(prefix)) return null;
  const key = imageUrl.slice(prefix.length);
  try {
    const abs = storagePath(key);
    if (!existsSync(abs)) return null;
    const ext = (key.split(".").pop() ?? "png").toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/png";
    return `data:${mime};base64,${readFileSync(abs).toString("base64")}`;
  } catch {
    return null;
  }
}

/** A short en-GB date, e.g. "3 Nov 2026", from an ISO "YYYY-MM-DD". */
function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-06" → "Jun 26". */
function monthShort(yyyymm: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  if (!m) return yyyymm;
  const mi = Number(m[2]) - 1;
  return `${MONTHS[mi] ?? m[2]} ${m[1]!.slice(2)}`;
}
const vsMkt = (n: number | null | undefined) => (n == null ? "—" : `${svar(n)} vs mkt`);
/** Signed rank movement (+ = moved up): "▲2" green / "▼1" red / "—". */
const rankMove = (n: number | null | undefined) =>
  n == null || n === 0 ? "—" : n > 0 ? `▲ ${n}` : `▼ ${Math.abs(n)}`;

// ── shared blocks reused across units (marketing/restaurant/spa) ──────────────

/** The full "Digital Ads & ROAS" block for a unit: KPI strip, per-platform
 *  table (incl. Reach + Conversions), a Spend-by-Platform doughnut and a
 *  Spend-vs-Revenue grouped bar. Mirrors the dashboard AdsBlock. */
function adsBlock(
  pptx: Pptx,
  titlePrefix: string,
  period: string,
  ads: AdsSummary,
  spendRevenue: { platform: string; spend: number; revenue: number }[],
) {
  const slide = contentSlide(pptx, `${titlePrefix} — Digital Ads & ROAS`, periodLabel(period));
  slide.addText(
    [
      { text: `Spend ${money(ads.totalSpend)}    `, options: { bold: true, color: TEAL } },
      { text: `Tracked Revenue ${money(ads.trackedRevenue)}    `, options: { bold: true, color: TEAL } },
      { text: `ROAS ${ads.roasPct != null ? ads.roasPct.toFixed(0) + "%" : "—"}`, options: { bold: true, color: GOLD } },
      { text: ads.roasRatio != null ? ` (every Rp 1 → Rp ${ads.roasRatio.toFixed(2)})    ` : "    ", options: { color: MUTE } },
      { text: `Clicks ${num(ads.totalClicks)}`, options: { bold: true, color: TEAL } },
      { text: ads.totalConversions != null ? `    Conversions ${num(ads.totalConversions)}` : "", options: { bold: true, color: TEAL } },
    ],
    { x: MX, y: 1.4, w: CONTENT_W, h: 0.4, fontFace: FONT, fontSize: 11.5 },
  );
  const rows: Cell[][] = [[head("Platform"), head("Spend", "right"), head("Impr.", "right"), head("Clicks", "right"), head("Reach", "right"), head("Conv.", "right"), head("CTR", "right"), head("CPC", "right"), head("Revenue", "right")]];
  for (const p of ads.platforms) {
    rows.push([
      td(adsLabel(p.platform)), td(money(p.spend), "right"), td(num(p.impressions), "right"), td(num(p.clicks), "right"),
      td(p.reach != null ? num(p.reach) : "—", "right"), td(p.conversions != null ? num(p.conversions) : "—", "right"),
      td(p.ctr != null ? formatPercent(p.ctr) : "—", "right"), td(money(p.cpc), "right"), td(money(p.trackedRevenue), "right"),
    ]);
  }
  addTable(slide, rows, 2.0, undefined, 9);
  const spendByPlatform = ads.platforms.filter((p) => p.spend > 0);
  if (spendByPlatform.length > 0) {
    doughnut(pptx, slide, "Spend by Platform", spendByPlatform.map((p) => adsLabel(p.platform)), spendByPlatform.map((p) => p.spend), MX, 4.05, 5.6, 2.9);
  }
  // Spend vs revenue bar on the same slide (right of the doughnut).
  if (spendRevenue.length > 0) {
    slide.addText("Spend vs Tracked Revenue", { x: 6.4, y: 4.05, w: CW - MX - 6.4, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
    slide.addChart(
      pptx.ChartType.bar,
      [
        { name: "Spend", labels: spendRevenue.map((s) => adsLabel(s.platform)), values: spendRevenue.map((s) => s.spend) },
        { name: "Tracked Revenue", labels: spendRevenue.map((s) => adsLabel(s.platform)), values: spendRevenue.map((s) => s.revenue) },
      ],
      {
        x: 6.4, y: 4.35, w: CW - MX - 6.4, h: 2.6, barDir: "col", chartColors: [TEAL, GOLD], showLegend: true, legendPos: "b",
        legendFontFace: FONT, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 9, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 9, showValue: false,
      },
    );
  }
}

/** The Tripadvisor block for a unit: rank/rating hero + a metrics grid with MoM. */
function tripBlock(pptx: Pptx, titlePrefix: string, period: string, t: TripadvisorSummary, hideZero = false) {
  const slide = contentSlide(pptx, `${titlePrefix} — Tripadvisor`, periodLabel(period));
  slide.addText(
    `${t.rank != null ? "#" + t.rank : "—"}${t.totalInMarket != null ? " of " + num(t.totalInMarket) : ""} ${t.noun} in ${t.area}${t.rating != null ? "   ·   " + t.rating.toFixed(1) + " / 5" : ""}`,
    { x: MX, y: 1.4, w: CONTENT_W, h: 0.35, fontFace: FONT, fontSize: 13, bold: true, color: TEAL },
  );
  // Match the dashboard TripadvisorBlock: when hideZero, drop metrics that are 0
  // with no reported MoM (so an empty listing doesn't render a wall of zeros).
  const metrics = hideZero ? t.metrics.filter((m) => m.value !== 0 || m.mom != null) : t.metrics;
  const rows: Cell[][] = [[head("Metric"), head("Value", "right"), head("MoM", "right")]];
  for (const m of metrics) rows.push([td(m.label), td(num(m.value), "right"), td(m.mom != null ? svar(m.mom) : "—", "right", varColor(m.mom))]);
  addTable(slide, rows, 1.95, undefined, 9);
}

/** Gokai CRM metric table (+ optional "(hotel-level)" scope note) and its summary. */
function gokaiBlock(
  pptx: Pptx,
  titlePrefix: string,
  period: string,
  gokai: { unit: string; metrics: { label: string; value: number; format: "number" | "pct" | "idr"; mom: number | null }[] } | null,
  gokaiNarrative: string | null | undefined,
) {
  if (!gokai && !(gokaiNarrative && gokaiNarrative.trim())) return;
  const scope = gokai && gokai.unit === "HOTEL" ? " (hotel-level)" : "";
  const slide = contentSlide(pptx, `${titlePrefix} — Gokai Upselling Tools${scope}`, periodLabel(period));
  if (gokai) {
    const rows: Cell[][] = [[head("Metric"), head("Value", "right"), head("MoM", "right")]];
    for (const m of gokai.metrics) rows.push([td(m.label), td(m.format === "idr" ? money(m.value) : m.format === "pct" ? formatPercent(m.value) : num(m.value), "right"), td(m.mom != null ? svar(m.mom) : "—", "right", varColor(m.mom))]);
    addTable(slide, rows, 1.5);
  }
  if (gokaiNarrative && gokaiNarrative.trim()) addNarrative(slide, gokaiNarrative, "", gokai ? 4.4 : 1.5);
}

// ── cover ───────────────────────────────────────────────────────────────────
function coverSlide(pptx: Pptx, property: { name: string; area: string; roomCount: number }, period: string) {
  const slide = pptx.addSlide();
  slide.background = { color: TEAL };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: CW, h: 0.12, fill: { color: GOLD }, line: { type: "none" } });
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 7.38, w: CW, h: 0.12, fill: { color: GOLD }, line: { type: "none" } });

  slide.addText("SALES HIGHLIGHT", { x: MX, y: 2.35, w: CONTENT_W, h: 0.5, fontFace: FONT, fontSize: 18, color: GOLD, bold: true, charSpacing: 5 });
  slide.addShape(pptx.ShapeType.rect, { x: MX + 0.03, y: 2.9, w: 1.8, h: 0.05, fill: { color: GOLD }, line: { type: "none" } });
  slide.addText(property.name, { x: MX, y: 3.05, w: CONTENT_W, h: 1.3, fontFace: FONT, fontSize: 44, color: "FFFFFF", bold: true });
  const detail = [periodLabel(period), property.area, property.roomCount > 0 ? `${property.roomCount} rooms` : null].filter(Boolean).join("    ·    ");
  slide.addText(detail, { x: MX, y: 4.45, w: CONTENT_W, h: 0.45, fontFace: FONT, fontSize: 18, color: "D7E3E6" });

  slide.addText("Blue Karma Group", { x: MX, y: 6.72, w: 7, h: 0.35, fontFace: FONT, fontSize: 13, color: GOLD, bold: true });
  slide.addText("Confidential — Internal Management Report", {
    x: CW - MX - 5.5, y: 6.74, w: 5.5, h: 0.3, fontFace: FONT, fontSize: 9, color: "9FB7BE", align: "right",
  });
}

// ── section builders ─────────────────────────────────────────────────────────
async function summarySection(pptx: Pptx, code: string, period: string) {
  const d = await getSummaryPageData(code, period);
  const slide = contentSlide(pptx, "Executive Summary — Achievement vs Budget", periodLabel(period));
  if (!d || !d.hasData) return noData(slide);

  // Status + "data as of" caption (dashboard footer).
  const statusTxt = d.status ? (d.status === "FINAL" ? "Final" : "Draft") : null;
  const capTxt = [statusTxt ? `Status: ${statusTxt}` : null, d.dataAsOf ? `Data as of ${fmtDate(d.dataAsOf)}` : null].filter(Boolean).join("   ·   ");
  if (capTxt) caption(slide, capTxt, 1.28);

  const rows: Cell[][] = [[head("Metric"), head("Actual", "right"), head("Budget", "right"), head("Last Year", "right"), head("Achievement", "right"), head("Variance", "right")]];
  for (const l of d.revenueLines) {
    const isRatio = l.format === "ratio";
    const ach = achievementPct(l.actual, l.budget);
    const varStr = isRatio ? `${(l.actual - l.budget) * 100 >= 0 ? "+" : ""}${((l.actual - l.budget) * 100).toFixed(2)} pts` : svar(variancePct(l.actual, l.budget));
    const varNum = isRatio ? l.actual - l.budget : variancePct(l.actual, l.budget);
    rows.push([
      td(l.label),
      td(isRatio ? formatRatioPct(l.actual) : money(l.actual), "right"),
      td(isRatio ? formatRatioPct(l.budget) : money(l.budget), "right"),
      td(l.lastYear == null ? "—" : isRatio ? formatRatioPct(l.lastYear) : money(l.lastYear), "right"),
      td(pct(ach), "right"),
      td(varStr, "right", varColor(varNum)),
    ]);
  }
  addTable(slide, rows, 1.55);

  // Department Contribution — revenue-mix doughnut (dashboard RevenueMixChart).
  const mix = d.mix.filter((m) => m.value > 0);
  if (mix.length > 0) {
    doughnut(pptx, slide, "Department Contribution (share of revenue)", mix.map((m) => m.label), mix.map((m) => m.value), MX, 4.55, 7.0, 2.5);
  }

  narrativeSlide(pptx, "Executive Summary — Narrative", period, d.narratives.summary?.content);
}

async function factorsSection(pptx: Pptx, code: string, period: string) {
  const d = await getSummaryPageData(code, period);
  const ext = contentSlide(pptx, "External Factors", periodLabel(period));
  addNarrative(ext, d?.narratives.external?.content ?? null, "No external factors written for this period yet.");

  const int = contentSlide(pptx, "Internal Factors & Forecast", periodLabel(period));
  addNarrative(int, d?.narratives.internal?.content ?? null, "No internal factors written for this period yet.");
  // 6-month occupancy forecast preview (dashboard ForecastOccupancyChart).
  const fc = d?.forecasts ?? [];
  if (fc.length > 0) {
    int.addText("6-Month Occupancy Forecast", { x: MX, y: 4.3, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
    lineChart(
      pptx, int, fc.map((f) => monthShort(f.month)),
      [
        { name: "Forecast Occ", values: fc.map((f) => f.forecastOcc) },
        { name: "Last Year", values: fc.map((f) => f.lastYearOcc) },
        { name: "Market Demand", values: fc.map((f) => f.marketDemand) },
      ],
      4.58, 2.3, [TEAL, MUTE, GOLD],
    );
  }
}

async function roomsSection(pptx: Pptx, code: string, period: string) {
  for (const scope of ["MTD", "YTD"] as const) {
    const d = await getSegmentsPageData(code, period, scope);
    const slide = contentSlide(pptx, `Market Segment — ${scope}`, periodLabel(period));
    if (!d || !d.hasData || d.segments.length === 0) {
      noData(slide);
      continue;
    }
    const cols = [1.85, 0.62, 0.62, 0.62, 0.95, 0.95, 1.2, 1.2, 1.2, 0.72, 0.72];
    const header = [
      head("Segment", "left", 8), head("RN A", "right", 8), head("RN B", "right", 8), head("RN LY", "right", 8),
      head("ARR A", "right", 8), head("ARR B", "right", 8), head("Rev A", "right", 8), head("Rev B", "right", 8), head("Rev LY", "right", 8),
      head("Var%", "right", 8), head("Ach%", "right", 8),
    ];
    const rowOf = (name: string, s: { actual: typeof d.totals.actual; budget: typeof d.totals.budget; lastYear: typeof d.totals.lastYear }, isTotal: boolean): Cell[] => {
      const mk = isTotal ? (t: string, a: "left" | "right" = "right") => totalCell(t, a, TEAL, 8) : (t: string, a: "left" | "right" = "right") => td(t, a, INK, 8);
      const varNum = variancePct(s.actual.revenue, s.budget.revenue);
      return [
        mk(name, "left"),
        mk(num(s.actual.rn)), mk(num(s.budget.rn)), mk(s.lastYear ? num(s.lastYear.rn) : "—"),
        mk(money(s.actual.arr)), mk(money(s.budget.arr)),
        mk(money(s.actual.revenue)), mk(money(s.budget.revenue)), mk(s.lastYear ? money(s.lastYear.revenue) : "—"),
        isTotal ? totalCell(svar(varNum), "right", varColor(varNum), 8) : td(svar(varNum), "right", varColor(varNum), 8),
        mk(pct(achievementPct(s.actual.revenue, s.budget.revenue))),
      ];
    };
    const rows: Cell[][] = [header];
    for (const s of d.segments) rows.push(rowOf(s.name, s, false));
    rows.push(rowOf("TOTAL", d.totals, true));
    addTable(slide, rows, 1.5, cols, 8);

    // Insight chips (computed, no AI) — matches segments/page.tsx.
    const totalRN = d.totals.actual.rn;
    const topSeg = [...d.segments].sort((a, b) => b.actual.rn - a.actual.rn)[0];
    const gapSeg = [...d.segments].sort((a, b) => a.actual.revenue - a.budget.revenue - (b.actual.revenue - b.budget.revenue))[0];
    const chips: string[] = [];
    if (topSeg && totalRN > 0) chips.push(`Top segment: ${topSeg.name} (${((topSeg.actual.rn / totalRN) * 100).toFixed(0)}% of RN)`);
    if (gapSeg) {
      const gap = gapSeg.actual.revenue - gapSeg.budget.revenue;
      chips.push(`Biggest gap vs budget: ${gapSeg.name} (${gap < 0 ? "−" : "+"}${formatIDR(Math.abs(gap))})`);
    }
    if (chips.length) caption(slide, chips.join("      ·      "), 4.5, TEAL);

    // Revenue by segment — Actual / Budget / Last Year.
    const topForChart = d.segments.slice(0, 8);
    groupedBarN(
      pptx, slide, topForChart.map((s) => s.name),
      [
        { name: "Actual", values: topForChart.map((s) => s.actual.revenue) },
        { name: "Budget", values: topForChart.map((s) => s.budget.revenue) },
        { name: "Last Year", values: topForChart.map((s) => s.lastYear?.revenue ?? 0) },
      ],
      4.9, 2.1, [TEAL, GOLD, LTTEAL],
    );
  }

  // Account production (YTD) — paginated so no account is dropped; includes a
  // running cumulative-% column (the dashboard's Pareto curve).
  const seg = await getSegmentsPageData(code, period, "YTD");
  const accHeader = [head("#"), head("Account"), head("Type"), head("Room Nights", "right"), head("Revenue", "right"), head("% of Rev", "right"), head("Cumulative", "right")];
  const accBody: Cell[][] = [];
  if (seg) {
    let cum = 0;
    for (const a of seg.accounts) {
      cum += a.pctOfRevenue;
      accBody.push([td(String(a.rank)), td(a.accountName), td(segmentLabel(a.accountType)), td(num(a.roomNights), "right"), td(money(a.revenue), "right"), td(`${a.pctOfRevenue.toFixed(1)}%`, "right"), td(`${Math.min(cum, 100).toFixed(1)}%`, "right")]);
    }
  }
  paginatedTable(pptx, "Account Production (YTD)", period, accHeader, accBody, 16, [0.5, 4.0, 1.7, 1.9, 2.0, 1.0, 1.0]);

  // Room types
  const rt = await getRoomTypesPageData(code, period);
  const rtSlide = contentSlide(pptx, "Room Type Analytics", periodLabel(period));
  if (rt && rt.hasData && rt.roomTypes.length > 0) {
    const rows: Cell[][] = [[head("Room Type"), head("Room Nights", "right"), head("ADR", "right"), head("Revenue", "right"), head("% Rev", "right")]];
    for (const r of rt.roomTypes) {
      rows.push([td(r.roomTypeName), td(num(r.roomNightsActual), "right"), td(money(r.adrActual), "right"), td(money(r.revenueActual), "right"), td(`${r.pctOfRevenue.toFixed(1)}%`, "right")]);
    }
    const totRN = rt.roomTypes.reduce((s, r) => s + r.roomNightsActual, 0);
    const totRev = rt.roomTypes.reduce((s, r) => s + r.revenueActual, 0);
    const blended = totRN > 0 ? totRev / totRN : 0;
    rows.push([totalCell("TOTAL"), totalCell(num(totRN), "right"), totalCell(money(blended), "right"), totalCell(money(totRev), "right"), totalCell("100.0%", "right")]);
    addTable(rtSlide, rows, 1.5);

    // Auto-insight callouts (dashboard room-types insight block).
    const top = rt.roomTypes[0]!;
    const topAdr = [...rt.roomTypes].sort((a, b) => b.adrActual - a.adrActual)[0]!;
    caption(
      rtSlide,
      `Top revenue: ${top.roomTypeName} (${formatPercent(top.pctOfRevenue)})   ·   Highest ADR: ${topAdr.roomTypeName} at ${formatIDR(topAdr.adrActual)}   ·   Blended ADR ${formatIDR(blended)}`,
      Math.min(1.5 + (rows.length + 1) * 0.32 + 0.1, 6.6),
      TEAL,
    );
    narrativeSlide(pptx, "Room Type Analysis", period, rt.narrative?.content);
  } else noData(rtSlide);

  // Guests. Nationality is scope-driven on the dashboard (MTD/YTD toggle), so
  // emit both — matching how Market Segment is dual-emitted. LOS is not
  // scope-filtered, so it's drawn once from the MTD fetch.
  const natHeader = [head("#"), head("Nationality"), head("Room Nights", "right"), head("Share", "right"), head("vs LY", "right"), head("Rank", "right")];
  let g: Awaited<ReturnType<typeof getGuestsPageData>> = null;
  for (const scope of ["MTD", "YTD"] as const) {
    const gs = await getGuestsPageData(code, period, scope);
    if (scope === "MTD") g = gs;
    const natBody: Cell[][] = [];
    if (gs && gs.hasData) {
      for (const n of gs.nationalities) {
        const mom = n.lastYearRoomNights == null ? null : momChange(n.roomNights, n.lastYearRoomNights);
        natBody.push([td(String(n.rank)), td(n.countryName), td(num(n.roomNights), "right"), td(`${n.sharePct.toFixed(1)}%`, "right"), td(mom == null ? "—" : svar(mom), "right", varColor(mom)), td(rankMove(n.rankMovement), "right", varColor(n.rankMovement))]);
      }
    }
    paginatedTable(pptx, `Nationality Mix — ${scope}`, period, natHeader, natBody, 18, [0.5, 4.4, 2.2, 1.5, 2.0, 1.5]);
  }

  // Length of Stay (own slide so the LY comparison + chips have room).
  const losSlide = contentSlide(pptx, "Length of Stay", periodLabel(period));
  if (g && g.hasData && g.losBuckets.length > 0) {
    caption(
      losSlide,
      `Average LOS: ${g.avgLos != null ? g.avgLos.toFixed(2) : "—"} nights   ·   3+ nights: ${g.share3Plus != null ? g.share3Plus.toFixed(1) : "—"}%${g.dominantBucket ? `   ·   Dominant bucket: ${g.dominantBucket} nights` : ""}`,
      1.35, TEAL,
    );
    const losRows: Cell[][] = [[head("LOS (nights)"), head("Bookings", "right"), head("Room Nights", "right"), head("vs LY RN", "right"), head("Share", "right")]];
    for (const l of g.losBuckets) losRows.push([td(l.bucket), td(num(l.bookings), "right"), td(num(l.roomNights), "right"), td(l.lastYearRoomNights == null ? "—" : num(l.lastYearRoomNights), "right"), td(`${l.sharePct.toFixed(1)}%`, "right")]);
    addTable(losSlide, losRows, 1.75);
    groupedBar(
      pptx, losSlide, g.losBuckets.map((l) => l.bucket),
      "This Year", g.losBuckets.map((l) => l.roomNights),
      "Last Year", g.losBuckets.map((l) => l.lastYearRoomNights ?? 0),
      Math.min(1.75 + (g.losBuckets.length + 1) * 0.33 + 0.2, 4.6), 2.2, [TEAL, LTTEAL],
    );
  } else noData(losSlide);
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
        { text: `ROAS ${a.roasPct != null ? a.roasPct.toFixed(0) + "%" : "—"}`, options: { bold: true, color: GOLD } },
        { text: a.roasRatio != null ? ` (every Rp 1 → Rp ${a.roasRatio.toFixed(2)})    ` : "    ", options: { color: MUTE } },
        { text: `Clicks ${num(a.totalClicks)}`, options: { bold: true, color: TEAL } },
      ],
      { x: MX, y: 1.4, w: CONTENT_W, h: 0.4, fontFace: FONT, fontSize: 11.5 },
    );
    // Hotel-unit ads mirror the marketing page: Spend/Impr/Clicks/Reach/CTR/CPC/Revenue
    // (the page shows no conversions here — unlike the restaurant/spa AdsBlock).
    const rows: Cell[][] = [[head("Platform"), head("Spend", "right"), head("Impr.", "right"), head("Clicks", "right"), head("Reach", "right"), head("CTR", "right"), head("CPC", "right"), head("Revenue", "right")]];
    for (const p of a.platforms) {
      rows.push([td(adsLabel(p.platform)), td(money(p.spend), "right"), td(num(p.impressions), "right"), td(num(p.clicks), "right"), td(p.reach != null ? num(p.reach) : "—", "right"), td(p.ctr != null ? formatPercent(p.ctr) : "—", "right"), td(money(p.cpc), "right"), td(money(p.trackedRevenue), "right")]);
    }
    addTable(adsSlide, rows, 2.0, undefined, 9);
    const spendByPlatform = a.platforms.filter((p) => p.spend > 0);
    if (spendByPlatform.length > 0) {
      doughnut(pptx, adsSlide, "Spend by Platform", spendByPlatform.map((p) => adsLabel(p.platform)), spendByPlatform.map((p) => p.spend), MX, 4.05, 5.6, 2.9);
    }
    if (d.spendRevenue.length > 0) {
      adsSlide.addText("Spend vs Tracked Revenue", { x: 6.4, y: 4.05, w: CW - MX - 6.4, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
      adsSlide.addChart(
        pptx.ChartType.bar,
        [
          { name: "Spend", labels: d.spendRevenue.map((s) => adsLabel(s.platform)), values: d.spendRevenue.map((s) => s.spend) },
          { name: "Tracked Revenue", labels: d.spendRevenue.map((s) => adsLabel(s.platform)), values: d.spendRevenue.map((s) => s.revenue) },
        ],
        { x: 6.4, y: 4.35, w: CW - MX - 6.4, h: 2.6, barDir: "col", chartColors: [TEAL, GOLD], showLegend: true, legendPos: "b", legendFontFace: FONT, catAxisLabelFontFace: FONT, catAxisLabelFontSize: 9, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 9, showValue: false },
      );
    }
  } else noData(adsSlide, "No ad data for this period.");

  // Online reputation — OTA rank cards + Tripadvisor.
  const repSlide = contentSlide(pptx, "Online Reputation — OTA & Tripadvisor", periodLabel(period));
  if (d && d.hasData && (d.rankCards.length > 0 || d.tripadvisor)) {
    const rows: Cell[][] = [[head("Platform"), head("Rank", "right"), head("Of", "right"), head("Rating", "right"), head("MoM Change", "right")]];
    for (const r of d.rankCards) {
      rows.push([td(rankLabel(r.platform)), td(r.rank != null ? `#${r.rank}` : "—", "right"), td(r.totalInMarket != null ? num(r.totalInMarket) : "—", "right"), td(r.rating != null ? `${r.rating.toFixed(1)}/5` : "—", "right"), td(r.change == null ? "—" : r.change > 0 ? `+${r.change} improved` : r.change < 0 ? `${r.change} dropped` : "no change", "right", varColor(r.change))]);
    }
    addTable(repSlide, rows, 1.5);
    if (d.tripadvisor) {
      const t = d.tripadvisor;
      repSlide.addText(`Tripadvisor: ${t.rank != null ? "#" + t.rank : "—"}${t.totalInMarket != null ? " of " + num(t.totalInMarket) : ""} in ${t.area}${t.rating != null ? "  ·  " + t.rating.toFixed(1) + "/5" : ""}`, { x: MX, y: 3.7, w: CONTENT_W, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: TEAL });
      const trows: Cell[][] = [[head("Metric"), head("Value", "right"), head("MoM", "right")]];
      for (const m of t.metrics) trows.push([td(m.label), td(num(m.value), "right"), td(m.mom != null ? svar(m.mom) : "—", "right", varColor(m.mom))]);
      addTable(repSlide, trows, 4.1, undefined, 9);
    }

    // 12-Month Rank Trend (inverted axis: up = better). Dashboard RankTrendChart.
    const trend = d.rankTrend.filter((r) => r.BOOKING != null || r.EXPEDIA != null || r.TRIPADVISOR != null);
    if (trend.length >= 2) {
      const rt = contentSlide(pptx, "OTA Ranking — 12-Month Trend", "Lower rank is better (axis inverted)");
      lineChart(
        pptx, rt, trend.map((r) => monthShort(r.month)),
        [
          { name: "Booking.com", values: trend.map((r) => r.BOOKING) },
          { name: "Expedia", values: trend.map((r) => r.EXPEDIA) },
          { name: "Tripadvisor", values: trend.map((r) => r.TRIPADVISOR) },
        ],
        1.6, 5.0, [TEAL, GOLD, ORANGE], true,
      );
    }

    // Full OTA rank history (the dashboard "all recorded rankings" table).
    const cell = (c: { rank: number; totalInMarket: number | null; rating: number | null } | null) =>
      c == null ? "—" : `#${c.rank}${c.totalInMarket != null ? "/" + c.totalInMarket : ""}${c.rating != null ? ` · ${c.rating.toFixed(1)}★` : ""}`;
    const histHeader = [head("Month"), head("Booking.com", "right"), head("Expedia", "right"), head("Tripadvisor", "right")];
    const histBody: Cell[][] = d.rankHistory.map((h) => [td(h.month), td(cell(h.BOOKING), "right"), td(cell(h.EXPEDIA), "right"), td(cell(h.TRIPADVISOR), "right")]);
    if (histBody.length > 0) paginatedTable(pptx, "OTA Ranking — Track Record", period, histHeader, histBody, 16, [2.2, 3.3, 3.3, 3.3]);
  } else noData(repSlide);
}

async function restaurantSection(pptx: Pptx, code: string, period: string) {
  const d = await getRestaurantPageData(code, period);
  const title = d?.property.restaurantName ?? "Restaurant";
  const ov = contentSlide(pptx, `${title} — Overview & Sales`, periodLabel(period));
  if (!d || !d.hasData) return noData(ov);

  if (d.overview) {
    const o = d.overview;
    ov.addText(
      [
        { text: `Covers ${num(o.covers.actual)} / ${num(o.covers.budget)} bud    `, options: { color: TEAL, bold: true } },
        { text: `Revenue ${money(o.revenue.actual)} / ${money(o.revenue.budget)} bud    `, options: { color: TEAL, bold: true } },
        { text: `Avg Check ${money(o.avgCheckActual)} / ${money(o.avgCheckBudget)} bud    `, options: { color: GOLD, bold: true } },
        { text: `Rev Ach ${pct(o.revenueAchievementPct)}`, options: { color: TEAL, bold: true } },
      ],
      { x: MX, y: 1.35, w: CONTENT_W, h: 0.5, fontFace: FONT, fontSize: 11, valign: "top" },
    );
  }
  if (d.meals.length > 0) {
    // Full Sales table: per meal Cover / Average Check / Revenue × Actual·%·Budget·%·Diff·% + TOTAL.
    const t = buildSalesTable(d.meals);
    const MEAL_LABEL: Record<string, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner", TOTAL: "TOTAL" };
    const rows: Cell[][] = [[head("Meal", "left", 8), head("Line", "left", 8), head("Actual", "right", 8), head("%", "right", 8), head("Budget", "right", 8), head("%", "right", 8), head("Diff", "right", 8), head("Diff %", "right", 8)]];
    const blocks = [...t.meals, t.total];
    for (const b of blocks) {
      const isTot = b.meal === "TOTAL";
      const mk = (txt: string, a: "left" | "right" = "right", color = INK) => (isTot ? totalCell(txt, a, color === INK ? TEAL : color, 8) : td(txt, a, color, 8));
      const lineRow = (lineLabel: string, c: { actual: number; actualPct: number; budget: number; budgetPct: number; diff: number; diffPct: number | null }, kind: "cover" | "money", signedPct: boolean, showMeal: boolean) => {
        const fmt = (v: number) => (kind === "cover" ? num(v) : money(v));
        const pctf = (v: number) => (signedPct ? svar(v) : `${v.toFixed(1)}%`);
        rows.push([
          showMeal ? mk(MEAL_LABEL[b.meal] ?? b.meal, "left") : mk("", "left"),
          mk(lineLabel, "left"),
          mk(fmt(c.actual)), mk(pctf(c.actualPct)), mk(fmt(c.budget)), mk(pctf(c.budgetPct)),
          mk(fmt(c.diff), "right", varColor(c.diff)), mk(c.diffPct != null ? svar(c.diffPct) : "—", "right", varColor(c.diffPct)),
        ]);
      };
      lineRow("Cover", b.cover, "cover", false, true);
      lineRow("Average Check", b.avgCheck, "money", true, false);
      lineRow("Revenue", b.revenue, "money", false, false);
    }
    addTable(ov, rows, 2.0, [1.15, 1.6, 1.55, 0.75, 1.55, 0.75, 1.5, 0.8], 8);

    // Meal-period insight chips.
    const byAch = [...d.meals].map((m) => ({ m, ach: achievementPct(m.revenueActual, m.revenueBudget) ?? 0 }));
    const strongest = [...byAch].sort((a, b) => b.ach - a.ach)[0];
    const weakest = [...byAch].sort((a, b) => a.ach - b.ach)[0];
    const outlier = [...d.meals].map((m) => ({ m, v: m.avgCheckActual != null && m.avgCheckBudget != null ? variancePct(m.avgCheckActual, m.avgCheckBudget) ?? 0 : 0 })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
    const ml = (s: string) => MEAL_LABEL[s] ?? s;
    if (strongest && weakest) {
      caption(ov, `Strongest: ${ml(strongest.m.meal)} ${strongest.ach.toFixed(0)}%   ·   Weakest: ${ml(weakest.m.meal)} ${weakest.ach.toFixed(0)}%${outlier && outlier.v !== 0 ? `   ·   ${ml(outlier.m.meal)} avg check ${svar(outlier.v)} vs budget` : ""}`, 6.55, TEAL);
    }

    // Revenue-by-meal Actual vs Budget chart on its own slide.
    const mealChart = contentSlide(pptx, `${title} — Revenue by Meal Period`, periodLabel(period));
    revenueBar(pptx, mealChart, d.meals.map((m) => ml(m.meal)), d.meals.map((m) => m.revenueActual), d.meals.map((m) => m.revenueBudget), 1.6, 5.0);
  }

  // Source of Booking — table (+ % + TOTAL) and a covers-mix doughnut.
  if (d.sources.length > 0) {
    const sob = contentSlide(pptx, `${title} — Source of Booking`, periodLabel(period));
    const CAT: Record<string, string> = { IN_HOUSE: "In-House", OUTSIDER: "Outsider", PLATFORM: "Platform" };
    const rows: Cell[][] = [[head("Source"), head("Type"), head("Persons", "right"), head("%", "right"), head("Avg Check", "right"), head("Revenue", "right")]];
    for (const s of d.sources) rows.push([td(s.sourceName), td(CAT[s.category] ?? s.category), td(num(s.persons), "right"), td(`${s.pctPersons.toFixed(1)}%`, "right"), td(money(s.avgCheck), "right"), td(money(s.revenue), "right")]);
    const totPersons = d.sources.reduce((a, s) => a + s.persons, 0);
    const totRev = d.sources.reduce((a, s) => a + s.revenue, 0);
    rows.push([totalCell("TOTAL"), totalCell(""), totalCell(num(totPersons), "right"), totalCell("100.0%", "right"), totalCell(money(avgCheck(totRev, totPersons)), "right"), totalCell(money(totRev), "right")]);
    addTable(sob, rows, 1.5, [3.5, 1.7, 1.6, 1.0, 2.1, 2.2]);
    // Covers-mix doughnut by category.
    const byCat = new Map<string, number>();
    for (const s of d.sources) byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.persons);
    const catEntries = [...byCat.entries()].filter(([, v]) => v > 0);
    if (catEntries.length > 0) {
      const chartY = Math.min(1.5 + (rows.length + 1) * 0.3 + 0.2, 4.4);
      doughnut(pptx, sob, "Covers Mix", catEntries.map(([k]) => CAT[k] ?? k), catEntries.map(([, v]) => v), MX, chartY, 6.0, 7.0 - chartY - 0.1);
    }
  }

  // Acquisition Split — channel table + daily chart (narrative on its own slide).
  if (d.acquisition.length > 0) {
    const aq = contentSlide(pptx, `${title} — Acquisition Split`, periodLabel(period));
    const rows: Cell[][] = [[head("Channel"), head("Bookings %", "right"), head("Covers %", "right")]];
    for (const c of d.acquisition) rows.push([td(c.label), td(`${c.bookingsPct.toFixed(1)}%`, "right"), td(`${c.coversPct.toFixed(1)}%`, "right")]);
    addTable(aq, rows, 1.5, [6.0, 3.0, 3.1]);
    if (d.acquisitionDaily.length > 0) {
      aq.addText("Daily — Bookings vs Covers", { x: MX, y: 4.4, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
      lineChart(pptx, aq, d.acquisitionDaily.map((p) => String(p.day)), [{ name: "Bookings", values: d.acquisitionDaily.map((p) => p.bookings) }, { name: "Covers", values: d.acquisitionDaily.map((p) => p.covers) }], 4.68, 2.3, [TEAL, GOLD]);
    }
  }
  narrativeSlide(pptx, `${title} — Customer Acquisition Breakdown`, period, d.acquisitionNarrative?.content);

  // Chope — funnel + sources split + revenue, with the daily chart. The daily
  // chart and the CHOPE_SUMMARY narrative follow the dashboard: each renders on
  // its own trigger (daily rows / saved text), independent of the report row.
  if (d.chope || d.chopeDaily.length > 0) {
    const ch = contentSlide(pptx, `${title} — Chope Reservations`, periodLabel(period));
    if (d.chope) {
      const c = d.chope;
      ch.addText(
        [
          { text: `Revenue ${money(c.revenue)}`, options: { bold: true, color: TEAL } },
          { text: c.pctOfRestaurantRevenue != null ? ` (${c.pctOfRestaurantRevenue.toFixed(1)}% of restaurant)` : "", options: { color: MUTE } },
          { text: c.averagePartySize != null ? `    Avg Party Size ${c.averagePartySize.toFixed(1)}` : "", options: { bold: true, color: TEAL } },
        ],
        { x: MX, y: 1.35, w: CONTENT_W, h: 0.35, fontFace: FONT, fontSize: 11.5 },
      );
      const funnel: Cell[][] = [[head("Status"), head("Bookings", "right"), head("Covers", "right")]];
      funnel.push([td("Fulfilled"), td(num(c.fulfilledBookings), "right"), td(num(c.fulfilledCovers), "right")]);
      funnel.push([td("Cancelled"), td(num(c.cancelledBookings), "right"), td(num(c.cancelledCovers), "right")]);
      funnel.push([td("No Show"), td(num(c.noShows), "right"), td(num(c.noShowCovers), "right")]);
      funnel.push([td("Upcoming"), td(num(c.upcomingBookings), "right"), td(num(c.upcomingCovers), "right")]);
      funnel.push([td("Walk-ins"), td(num(c.walkinBookings), "right"), td(num(c.walkinCovers), "right")]);
      addTable(ch, funnel, 1.85, [3.0, 1.6, 1.6]);
      ch.addText("Booking Sources", { x: 6.9, y: 1.78, w: 5.8, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
      const srcT: Cell[][] = [[head("Source"), head("Bookings", "right"), head("Covers", "right")]];
      srcT.push([td("Chope / Grab platform"), td(num(c.platformBookings), "right"), td(num(c.platformCovers), "right")]);
      srcT.push([td("Restaurant direct"), td(num(c.directBookings), "right"), td(num(c.directCovers), "right")]);
      ch.addTable(srcT.map((r, i) => (i > 0 && i % 2 === 0 ? r.map((cc) => ({ ...cc, options: { ...cc.options, fill: { color: ZEBRA } } })) : r)), { x: 6.9, y: 2.05, w: 5.8, colW: [3.0, 1.4, 1.4], border: { type: "solid", color: LINE, pt: 0.5 }, valign: "middle", fontFace: FONT, fontSize: 9.5, color: INK, autoPage: false });
    }
    if (d.chopeDaily.length > 0) {
      ch.addText("Traffic by Online Booking Sources (daily)", { x: MX, y: 4.3, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
      lineChart(pptx, ch, d.chopeDaily.map((p) => String(p.day)), [{ name: "Platform", values: d.chopeDaily.map((p) => p.platformBookings) }, { name: "Direct", values: d.chopeDaily.map((p) => p.directBookings) }], 4.58, 2.3, [TEAL, GOLD]);
    }
  }
  narrativeSlide(pptx, `${title} — Chope Booking Performance Summary`, period, d.chopeNarrative?.content);

  // Gokai CRM (metrics + summary) and the overview narrative.
  gokaiBlock(pptx, title, period, d.gokai, d.gokaiNarrative?.content);

  // Restaurant Ads + Tripadvisor (unit = RESTAURANT). The narrative renders
  // whenever it's written (the dashboard shows it even without a listing row).
  if (d.ads) adsBlock(pptx, title, period, d.ads, d.spendRevenue);
  if (d.tripadvisor) tripBlock(pptx, title, period, d.tripadvisor);
  narrativeSlide(pptx, `${title} — Tripadvisor Performance Summary`, period, d.tripadvisorNarrative?.content);

  narrativeSlide(pptx, `${title} — Overview Narrative`, period, overviewContentToText(d.narrative?.content ?? null) || null);
}

async function spaSection(pptx: Pptx, code: string, period: string) {
  const d = await getSpaPageData(code, period);
  const title = d?.property.spaName ?? "Spa & Wellness";
  const ov = contentSlide(pptx, `${title} — Guest Segments`, periodLabel(period));
  if (!d || !d.hasData) return noData(ov);

  // KPI strip (dashboard headline cards).
  if (d.overview) {
    const o = d.overview;
    ov.addText(
      [
        { text: `Covers ${num(o.covers.actual)} / ${num(o.covers.budget)} bud    `, options: { color: TEAL, bold: true } },
        { text: `Revenue ${money(o.revenue.actual)} / ${money(o.revenue.budget)} bud    `, options: { color: TEAL, bold: true } },
        { text: `Avg Check ${money(o.avgCheckActual)} / ${money(o.avgCheckBudget)} bud    `, options: { color: GOLD, bold: true } },
        { text: `Rev Ach ${pct(o.revenueAchievementPct)}`, options: { color: TEAL, bold: true } },
      ],
      { x: MX, y: 1.32, w: CONTENT_W, h: 0.5, fontFace: FONT, fontSize: 11, valign: "top" },
    );
  }

  const SEG: Record<string, string> = { IN_HOUSE: "In-House", OUTSIDE: "Outside", INCLUSION: "Inclusion" };
  if (d.segments.length > 0) {
    // Full segment table: Covers (A/B/%) · Average Check (A/B/%) · Revenue (A/B/Diff/%),
    // where % is the signed variance vs budget (matches the dashboard).
    const cols = [1.55, 0.95, 0.95, 0.72, 1.2, 1.2, 0.72, 1.35, 1.35, 1.1, 0.72];
    const rows: Cell[][] = [[
      head("Segment", "left", 8), head("Cov A", "right", 8), head("Cov B", "right", 8), head("Cov %", "right", 8),
      head("AC A", "right", 8), head("AC B", "right", 8), head("AC %", "right", 8),
      head("Rev A", "right", 8), head("Rev B", "right", 8), head("Rev Diff", "right", 8), head("Rev %", "right", 8),
    ]];
    const segRow = (name: string, coversA: number, coversB: number, acA: number | null, acB: number | null, revA: number, revB: number, isTot: boolean): Cell[] => {
      const mk = (t: string, a: "left" | "right" = "right", color = INK) => (isTot ? totalCell(t, a, color === INK ? TEAL : color, 8) : td(t, a, color, 8));
      const cvPct = variancePct(coversA, coversB);
      const acPct = acA != null && acB != null ? variancePct(acA, acB) : null;
      const revPct = variancePct(revA, revB);
      const revDiff = revA - revB;
      return [
        mk(name, "left"),
        mk(num(coversA)), mk(num(coversB)), mk(svar(cvPct), "right", varColor(cvPct)),
        mk(money(acA)), mk(money(acB)), mk(acPct != null ? svar(acPct) : "—", "right", varColor(acPct)),
        mk(money(revA)), mk(money(revB)), mk(svar2(revDiff), "right", varColor(revDiff)), mk(svar(revPct), "right", varColor(revPct)),
      ];
    };
    for (const s of d.segments) rows.push(segRow(SEG[s.segment] ?? s.segment, s.coversActual, s.coversBudget, s.avgCheckActual, s.avgCheckBudget, s.revenueActual, s.revenueBudget, false));
    const cA = d.segments.reduce((a, s) => a + s.coversActual, 0);
    const cB = d.segments.reduce((a, s) => a + s.coversBudget, 0);
    const rA = d.segments.reduce((a, s) => a + s.revenueActual, 0);
    const rB = d.segments.reduce((a, s) => a + s.revenueBudget, 0);
    rows.push(segRow("TOTAL", cA, cB, avgCheck(rA, cA), avgCheck(rB, cB), rA, rB, true));
    addTable(ov, rows, 1.95, cols, 8);

    // Auto-insight (dashboard segInsight) — only when a segment actually beat
    // budget (revenue variance > 0); otherwise the dashboard shows no claim.
    const beat = [...d.segments].map((s) => ({ s, v: variancePct(s.revenueActual, s.revenueBudget) ?? 0 })).sort((a, b) => b.v - a.v)[0];
    if (beat && beat.v > 0) {
      const seg = beat.s;
      const cvV = variancePct(seg.coversActual, seg.coversBudget);
      const acV = seg.avgCheckActual != null && seg.avgCheckBudget != null ? variancePct(seg.avgCheckActual, seg.avgCheckBudget) : null;
      caption(ov, `Beat budget: ${SEG[seg.segment] ?? seg.segment} ${svar(beat.v)}   ·   covers ${svar(cvV)}   ·   avg check ${acV != null ? svar(acV) : "—"}`, Math.min(1.95 + (rows.length + 1) * 0.3 + 0.1, 4.6), TEAL);
    }
    groupedBar(pptx, ov, d.segments.map((s) => SEG[s.segment] ?? s.segment), "Revenue Actual", d.segments.map((s) => s.revenueActual), "Revenue Budget", d.segments.map((s) => s.revenueBudget), 5.0, 2.0, [TEAL, GOLD]);
  }

  // Top treatments.
  const tr = contentSlide(pptx, `${title} — Top Treatments`, periodLabel(period));
  if (d.treatments.length > 0) {
    const rows: Cell[][] = [[head("#"), head("Treatment"), head("Count", "right"), head("Revenue", "right"), head("Avg Price", "right")]];
    for (const t of d.treatments) rows.push([td(String(t.rank)), td(t.treatmentName), td(num(t.count), "right"), td(money(t.revenue), "right"), td(money(t.avgPrice), "right")]);
    addTable(tr, rows, 1.45);
  } else noData(tr);

  // Gokai (metrics + summary + hotel-level fallback note).
  gokaiBlock(pptx, title, period, d.gokai, d.gokaiNarrative?.content);

  // Spa Ads + Tripadvisor (unit = SPA). The spa listing hides zero-value
  // metrics (hideZeroMetrics) and the narrative renders even without a row.
  if (d.ads) adsBlock(pptx, title, period, d.ads, d.spendRevenue);
  if (d.tripadvisor) tripBlock(pptx, title, period, d.tripadvisor, true);
  narrativeSlide(pptx, `${title} — Tripadvisor Performance Summary`, period, d.tripadvisorNarrative?.content);

  narrativeSlide(pptx, `${title} — Overview Narrative`, period, overviewContentToText(d.narrative?.content ?? null) || null);
}

async function marketSection(pptx: Pptx, code: string, period: string) {
  const d = await getMarketPageData(code, period);
  if (!d) {
    noData(contentSlide(pptx, "Market & Forecast", periodLabel(period)));
    return;
  }
  let any = false;
  let anyNarr = false;
  // Section narratives render on the dashboard even when the sibling data block
  // is empty (so a saved write-up is never orphaned) — emit each unconditionally.
  const narr = (t: string, c: string | null | undefined) => {
    if (c && c.trim()) {
      narrativeSlide(pptx, t, period, c);
      anyNarr = true;
    }
  };

  // Market Area Update — Booking.com property vs market: room-nights (bars) + ADR (lines).
  if (d.marketArea.length > 0) {
    any = true;
    const s = contentSlide(pptx, "Market Area Update", "Booking.com — property vs market");
    const labels = d.marketArea.map((m) => m.monthLabel);
    s.addText("Room nights — property vs market", { x: MX, y: 1.35, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
    groupedBar(pptx, s, labels, "Room nights", d.marketArea.map((m) => m.propertyRoomNights), "Market", d.marketArea.map((m) => m.marketRoomNights), 1.62, 2.4, [TEAL, LTTEAL]);
    s.addText("Average daily rate (IDR) — property vs market", { x: MX, y: 4.15, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
    lineChart(pptx, s, labels, [{ name: "ADR", values: d.marketArea.map((m) => m.propertyAdr) }, { name: "Market ADR", values: d.marketArea.map((m) => m.marketAdr) }], 4.42, 2.4, [ORANGE, GOLD]);
  }
  narr("Market Area — Summary", d.marketAreaNarrative?.content);

  // Booking Window — advance-booking lead-time, property vs market. The table
  // and its summary share one slide: table on top, summary in two columns below.
  const bw = d.bookingWindow;
  const bwNarr = d.bookingWindowNarrative?.content;
  if (bw && bw.buckets.length > 0) {
    any = true;
    const subParts = [bw.windowLabel, bw.dataAsOf ? `Data as of ${fmtDate(bw.dataAsOf)}` : null, `${num(bw.totalBookedRooms)} booked rooms`].filter(Boolean);
    const s = contentSlide(pptx, "Booking Window", subParts.join("  ·  ") || periodLabel(period));
    const rows: Cell[][] = [[head("Lead time", "left", 8.5), head("Property share", "right", 8.5), head("Market share", "right", 8.5), head("Property ADR", "right", 8.5), head("Market ADR", "right", 8.5)]];
    for (const b of bw.buckets) rows.push([td(b.bucket, "left", INK, 8.5), td(sharePct(b.propertySharePct), "right", INK, 8.5), td(sharePct(b.marketSharePct), "right", INK, 8.5), td(money(b.propertyAdr), "right", INK, 8.5), td(money(b.marketAdr), "right", INK, 8.5)]);
    addTable(s, rows, 1.4, undefined, 8.5);
    if (bwNarr && bwNarr.trim()) {
      const yTop = 1.4 + rows.length * 0.245 + 0.14;
      s.addText("Summary", { x: MX, y: yTop, w: CONTENT_W, h: 0.24, fontFace: FONT, fontSize: 10, bold: true, color: TEAL });
      const textY = yTop + 0.3;
      twoColumnText(s, bwNarr, MX, textY, CONTENT_W, 6.82 - textY, 9);
      anyNarr = true;
    }
  } else {
    narr("Booking Window — Summary", bwNarr);
  }

  // Booking.com Overview — search → page → booking funnel vs market + availability trend.
  const bo = d.bookingOverview;
  if (bo) {
    any = true;
    const subParts = [bo.windowLabel, bo.dataAsOf ? `Data as of ${fmtDate(bo.dataAsOf)}` : null].filter(Boolean);
    const s = contentSlide(pptx, "Booking.com Overview", subParts.join("  ·  ") || periodLabel(period));
    const convCell = (val: number, mktPct: number | null) =>
      td(mktPct != null ? `${sharePct(val)}  ·  mkt ${sharePct(mktPct)}` : sharePct(val), "right");
    const rows: Cell[][] = [[head("Metric"), head("Value", "right"), head("vs Market", "right")]];
    rows.push([td("Search Results Views"), td(num(bo.searchResultsViews), "right"), td(vsMkt(bo.searchResultsViewsVsMkt), "right", varColor(bo.searchResultsViewsVsMkt))]);
    rows.push([td("Property Page Visits"), td(num(bo.propertyPageVisits), "right"), td(vsMkt(bo.propertyPageVisitsVsMkt), "right", varColor(bo.propertyPageVisitsVsMkt))]);
    rows.push([td("Search → Page Conversion"), convCell(bo.searchToPagePct, bo.searchToPageMarketPct), td(vsMkt(bo.searchToPageVsMkt), "right", varColor(bo.searchToPageVsMkt))]);
    rows.push([td("Bookings Made"), td(num(bo.bookingsMade), "right"), td(vsMkt(bo.bookingsMadeVsMkt), "right", varColor(bo.bookingsMadeVsMkt))]);
    rows.push([td("Page → Booking Conversion"), convCell(bo.pageToBookingPct, bo.pageToBookingMarketPct), td(vsMkt(bo.pageToBookingVsMkt), "right", varColor(bo.pageToBookingVsMkt))]);
    rows.push([td("Availability for Search"), td(sharePct(bo.availabilityPct), "right"), td(vsMkt(bo.availabilityVsMkt), "right", varColor(bo.availabilityVsMkt))]);
    addTable(s, rows, 1.5);
    if (bo.availability.length > 1) {
      s.addText("Availability for Search — your availability vs market", { x: MX, y: 4.45, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
      lineChart(pptx, s, bo.availability.map((a) => a.monthLabel), [{ name: "Your availability", values: bo.availability.map((a) => a.yourPct) }, { name: "Market", values: bo.availability.map((a) => a.marketPct) }], 4.72, 2.25, [TEAL, LTTEAL]);
    }
  }
  narr("Booking.com Overview — Summary", d.bookingOverviewNarrative?.content);

  // Sojern Market Overview — flight & hotel travel-intent index vs baseline.
  const sj = d.sojern;
  if (sj && sj.points.length > 0) {
    any = true;
    const sub = [`Destination: ${sj.destination}`, sj.originCountry ? `Origin: ${sj.originCountry}` : null, `Event: ${sj.eventType}`, sj.timePeriod, `vs ${sj.baselineLabel}`].filter(Boolean).join("  ·  ");
    const s = contentSlide(pptx, "Sojern Market Overview", sub);
    const yr = (row: SojernChartRow, y: number): number | null => (typeof row[String(y)] === "number" ? (row[String(y)] as number) : null);
    const hasFlight = sj.flight.length > 0;
    const hasHotel = sj.hotel.length > 0;
    if (hasFlight) {
      s.addText("Flight Volume Index (% vs baseline)", { x: MX, y: 1.35, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
      lineChart(pptx, s, sj.flight.map((r) => r.month), sj.years.map((y) => ({ name: String(y), values: sj.flight.map((r) => yr(r, y)) })), 1.62, hasHotel ? 2.4 : 5.0);
    }
    if (hasHotel) {
      s.addText("Hotel Volume Index (% vs baseline)", { x: MX, y: hasFlight ? 4.15 : 1.35, w: CONTENT_W, h: 0.25, fontFace: FONT, fontSize: 10, bold: true, color: MUTE });
      lineChart(pptx, s, sj.hotel.map((r) => r.month), sj.years.map((y) => ({ name: String(y), values: sj.hotel.map((r) => yr(r, y)) })), hasFlight ? 4.42 : 1.62, hasFlight ? 2.4 : 5.0);
    }
  }
  narr("Sojern Market Overview — Summary", d.sojernNarrative?.content);

  if (!any && !anyNarr) noData(contentSlide(pptx, "Market & Forecast", periodLabel(period)));
}

async function plansSection(pptx: Pptx, code: string, period: string) {
  const d = await getPlansPageData(code, period);
  const order: { id: string; label: string; empty: string }[] = [
    { id: "ACTION_PLAN", label: "Sales & Marketing Action Plan", empty: "No action plan written for this period yet." },
    { id: "SALES_STRATEGY", label: "Sales Strategy per Segment", empty: "No segment strategy written for this period yet." },
    { id: "MARKETING_PLAN", label: "Marketing Plan", empty: "No marketing plan written for this period yet." },
    { id: "SOCIAL_PLAN", label: "Social Media Plan", empty: "No social plan written for this period yet." },
    { id: "CONSORTIA", label: "Consortia & Partners", empty: "No consortia notes written for this period yet." },
    { id: "MAGAZINE", label: "Magazine", empty: "No magazine features recorded for this period yet." },
    { id: "PR", label: "Media Features & PR", empty: "No media features recorded for this period yet." },
    { id: "PROMOTIONS", label: "Ongoing Promotions", empty: "No promotions written for this period yet." },
  ];
  const CONSORTIA_PARTNERS = ["Viator", "Bali.com", "Classpass", "Klook"];
  for (const o of order) {
    const slide = contentSlide(pptx, o.label, periodLabel(period));
    addNarrative(slide, d?.sections[o.id]?.current?.content ?? null, o.empty);
    if (o.id === "CONSORTIA") {
      slide.addText(`Partners: ${CONSORTIA_PARTNERS.join("   ·   ")}`, { x: MX, y: 6.5, w: CONTENT_W, h: 0.3, fontFace: FONT, fontSize: 11, bold: true, color: TEAL });
    }
  }

  // Ongoing Promotions — uploaded image galleries per unit.
  if (d) {
    const promoUnits: { key: string; label: string }[] = [
      { key: "ROOMS", label: "Rooms" },
      { key: "RESTAURANT", label: d.property.restaurantName },
      { key: "SPA", label: d.property.spaName },
      { key: "WELLNESS", label: "Wellness" },
    ];
    for (const u of promoUnits) {
      const imgs = (d.promoImages[u.key] ?? []).filter((i) => imageData(i.imageUrl));
      if (imgs.length === 0) continue;
      const PER = 3;
      for (let p = 0; p * PER < imgs.length; p += 1) {
        const slide = contentSlide(pptx, `Promotions — ${u.label}${imgs.length > PER ? ` (${p + 1})` : ""}`, periodLabel(period));
        const chunk = imgs.slice(p * PER, p * PER + PER);
        const cardW = 3.7;
        const gap = (CONTENT_W - cardW * chunk.length) / Math.max(chunk.length, 1);
        chunk.forEach((img, i) => {
          const data = imageData(img.imageUrl)!;
          const x = MX + i * (cardW + gap);
          slide.addImage({ data, x, y: 1.5, w: cardW, h: 4.3, sizing: { type: "contain", w: cardW, h: 4.3 } });
          if (img.caption) slide.addText(img.caption, { x, y: 5.9, w: cardW, h: 0.9, fontFace: FONT, fontSize: 10, color: INK, align: "center", valign: "top" });
        });
      }
    }
  }
}

async function socialSection(pptx: Pptx, code: string, period: string) {
  const d = await getSocialPageData(code, period);
  const UNIT: Record<string, string> = { HOTEL: "Hotel", RESTAURANT: "Restaurant", SPA: "Spa" };
  const METRICS: { key: string; label: string }[] = [
    { key: "impressions", label: "Impressions" },
    { key: "reach", label: "Reach" },
    { key: "interactions", label: "Interactions" },
    { key: "linkClicks", label: "Link Clicks" },
    { key: "profileVisits", label: "Profile Visits" },
    { key: "followersGained", label: "Followers Gained" },
  ];

  const unitsWithData = (d?.units ?? []).filter((u) => u.hasData);
  if (unitsWithData.length === 0) {
    noData(contentSlide(pptx, "Social Media Reports", periodLabel(period)));
  } else {
    // One slide per unit, matching the dashboard: Instagram & Facebook only,
    // each metric with its value + MoM, plus the per-platform Summary narratives.
    for (const u of unitsWithData) {
      const ig = u.platforms.find((p) => p.platform === "INSTAGRAM");
      const fb = u.platforms.find((p) => p.platform === "FACEBOOK");
      const slide = contentSlide(pptx, `Social Media — ${UNIT[u.unit] ?? u.unit}`, `${periodLabel(period)}  ·  Instagram & Facebook`);
      const cellFor = (card: typeof ig, key: string) => {
        const m = card?.metrics.find((x) => x.key === key);
        return { value: m && m.value != null ? num(m.value) : "—", mom: m && m.value != null ? m.mom : null };
      };
      const rows: Cell[][] = [[head("Metric"), head("Instagram", "right"), head("IG MoM", "right"), head("Facebook", "right"), head("FB MoM", "right")]];
      for (const met of METRICS) {
        const i = cellFor(ig, met.key);
        const f = cellFor(fb, met.key);
        rows.push([td(met.label), td(i.value, "right"), td(i.mom != null ? svar(i.mom) : "—", "right", varColor(i.mom)), td(f.value, "right"), td(f.mom != null ? svar(f.mom) : "—", "right", varColor(f.mom))]);
      }
      addTable(slide, rows, 1.5, [3.2, 2.3, 1.6, 2.3, 1.6]);
      // Per-platform narrative summary (gold box on the dashboard).
      const narrated = u.platforms.filter((p) => p.narrative);
      if (narrated.length > 0) {
        const PLAT: Record<string, string> = { INSTAGRAM: "Instagram", FACEBOOK: "Facebook", TIKTOK: "TikTok", YOUTUBE: "YouTube" };
        const parts = narrated.map((p) => `${PLAT[p.platform] ?? p.platform}: ${p.narrative}`);
        slide.addText(
          [{ text: "Summary\n", options: { bold: true, color: TEAL, fontSize: 11 } }, { text: parts.join("\n"), options: { color: INK, fontSize: 10.5 } }],
          { x: MX, y: 4.35, w: CONTENT_W, h: 2.55, fontFace: FONT, valign: "top", lineSpacingMultiple: 1.12 },
        );
      }
    }
  }

  // Influencer Collaborations — the original post screenshot + its details.
  const infs = d?.influencers ?? [];
  if (infs.length > 0) {
    const PER = 3;
    const rowH = 1.95;
    for (let page = 0; page * PER < infs.length; page += 1) {
      const slide = page === 0
        ? contentSlide(pptx, "Influencer Collaborations", periodLabel(period))
        : contentSlide(pptx, "Influencer Collaborations (cont.)", periodLabel(period));
      const chunk = infs.slice(page * PER, page * PER + PER);
      chunk.forEach((i, idx) => {
        const y = 1.5 + idx * rowH;
        const data = imageData(i.imageUrl);
        if (data) {
          slide.addImage({ data, x: MX, y, w: 2.9, h: rowH - 0.1, sizing: { type: "contain", w: 2.9, h: rowH - 0.1 } });
        } else {
          slide.addShape(pptx.ShapeType.rect, { x: MX, y, w: 2.9, h: rowH - 0.1, fill: { color: "F3F6F7" }, line: { color: LINE, width: 0.5 } });
          slide.addText("No image", { x: MX, y: y + (rowH - 0.1) / 2 - 0.15, w: 2.9, h: 0.3, fontFace: FONT, fontSize: 9, color: MUTE, align: "center" });
        }
        const tx = MX + 3.15;
        const clean = i.handle.replace(/^@/, "");
        slide.addText(
          [
            { text: `${i.name}\n`, options: { bold: true, fontSize: 14, color: INK } },
            { text: `@${clean}\n`, options: { fontSize: 11, color: TEAL } },
            { text: `Followers: ${num(i.followers)}${i.origin && i.origin !== "—" ? `   ·   Origin: ${i.origin}` : ""}\n`, options: { fontSize: 10, color: MUTE } },
            ...(i.notes ? [{ text: `\n${i.notes}`, options: { fontSize: 10.5, color: INK } }] : []),
          ],
          { x: tx, y, w: CW - MX - tx, h: rowH - 0.1, fontFace: FONT, valign: "top", lineSpacingMultiple: 1.1 },
        );
      });
    }
  } else {
    noData(contentSlide(pptx, "Influencer Collaborations", periodLabel(period)), "No influencer collaborations recorded for this period.");
  }
}

/** Signed absolute number with an explicit + for gains (for diff columns). */
function svar2(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${formatIDR(Math.abs(n))}`;
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
    select: { code: true, name: true, area: true, roomCount: true },
  });
  if (!property) return null;

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "BK", width: CW, height: 7.5 });
  pptx.layout = "BK";
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT };
  pptx.author = "BK Sales Dashboard";
  pptx.company = "Blue Karma Group";
  pptx.title = `${property.name} — Sales Highlight ${periodLabel(period)}`;

  defineMasters(pptx, `Blue Karma Group   ·   ${property.name}   ·   ${periodLabel(period)}`);
  coverSlide(pptx, property, period);

  const selected = sectionIds.length ? sectionIds : DEFAULT_SECTION_IDS;
  let idx = 0;
  for (const s of DECK_SECTIONS) {
    if (!selected.includes(s.id)) continue;
    idx += 1;
    dividerSlide(pptx, idx, s.label);
    await BUILDERS[s.id](pptx, propertyCode, period);
  }

  const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
  return { buffer, fileName: `${property.code}-${period}-sales-highlight.pptx` };
}
