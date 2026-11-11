/**
 * Pure helpers for the Market Segment manual-upload / AI-compile flow — no
 * DB/AI imports, so they unit-test cleanly. The AI returns one flat object per
 * segment (This Year / Budget / Last Year × room-nights · ARR · revenue); these
 * functions normalise that and expand it into segment_production rows (one per
 * series that actually carries data), matching the SEGMENT import tab.
 */

export type SegmentSeries = "ACTUAL" | "BUDGET" | "LAST_YEAR";

export interface SeriesTriple {
  rn: number;
  arr: number;
  revenue: number;
}

export interface ExtractedSegment {
  segmentName: string;
  actual: SeriesTriple;
  budget: SeriesTriple;
  lastYear: SeriesTriple | null;
}

export interface SegmentRowInput {
  scope: "MTD" | "YTD";
  segmentName: string;
  series: SegmentSeries;
  roomNights: number;
  arr: number;
  roomRevenue: number;
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** ARR falls back to revenue / room-nights when the source omits it. */
function triple(rn: unknown, arr: unknown, rev: unknown): SeriesTriple {
  const roomNights = Math.round(num(rn));
  const revenue = num(rev);
  let a = num(arr);
  if (a === 0 && roomNights > 0 && revenue > 0) a = revenue / roomNights;
  return { rn: roomNights, arr: a, revenue };
}

const hasData = (t: SeriesTriple | null): boolean => !!t && (t.rn > 0 || t.arr > 0 || t.revenue > 0);

/**
 * Normalise the AI's extracted rows into clean segments. Accepts either a
 * `{ segments: [...] }` wrapper or a bare array. Each row may use ty_/bud_/ly_
 * prefixes (preferred) or nested actual/budget/lastYear objects. Segments with
 * no usable figures are dropped.
 */
export function normalizeExtraction(raw: unknown): ExtractedSegment[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { segments?: unknown }).segments)
      ? (raw as { segments: unknown[] }).segments
      : [];

  // Dedupe by segment name (last wins) — a repeated name would otherwise break
  // the (period, scope, segment, series) unique constraint on save.
  const byName = new Map<string, ExtractedSegment>();
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = String(o.segment ?? o.segmentName ?? o.name ?? "").trim();
    if (!name) continue;

    const nested = (key: string): Record<string, unknown> =>
      o[key] && typeof o[key] === "object" ? (o[key] as Record<string, unknown>) : {};
    const a = nested("actual");
    const b = nested("budget");
    const l = nested("lastYear");

    const actual = triple(o.ty_rn ?? a.rn ?? a.roomNights, o.ty_arr ?? a.arr, o.ty_rev ?? a.revenue ?? a.roomRevenue);
    const budget = triple(o.bud_rn ?? b.rn ?? b.roomNights, o.bud_arr ?? b.arr, o.bud_rev ?? b.revenue ?? b.roomRevenue);
    const lastYearT = triple(o.ly_rn ?? l.rn ?? l.roomNights, o.ly_arr ?? l.arr, o.ly_rev ?? l.revenue ?? l.roomRevenue);

    if (!hasData(actual) && !hasData(budget) && !hasData(lastYearT)) continue;
    byName.set(name.toLowerCase(), { segmentName: name, actual, budget, lastYear: hasData(lastYearT) ? lastYearT : null });
  }
  return [...byName.values()];
}

/** Expand clean segments into segment_production rows (a row per series with data). */
export function expandToRows(segments: ExtractedSegment[], scope: "MTD" | "YTD"): SegmentRowInput[] {
  const rows: SegmentRowInput[] = [];
  const push = (segmentName: string, series: SegmentSeries, t: SeriesTriple | null) => {
    if (!hasData(t)) return;
    rows.push({ scope, segmentName, series, roomNights: t!.rn, arr: t!.arr, roomRevenue: t!.revenue });
  };
  for (const s of segments) {
    push(s.segmentName, "ACTUAL", s.actual);
    push(s.segmentName, "BUDGET", s.budget);
    push(s.segmentName, "LAST_YEAR", s.lastYear);
  }
  return rows;
}
