/**
 * Deterministic reader for a Budget & Last Year table embedded in a spreadsheet
 * — no AI required. It scans a sheet grid for the standard monthly block (the
 * "YEAR TO DATE … FORECAST" table in the weekly report workbook): a header row
 * with Budget / Last Year columns grouped under Occupancy, ARR and Revenue, then
 * one row per month.
 *
 * It is tolerant of layout: it finds the header row by content (not a fixed
 * position), skips empty/merged-cell gaps, reads month names or numbers, stops
 * at an Average/Total row, and parses Indonesian ("2.261.496", "83,33%") or US
 * number formats via the shared `normalizeNumber`. Occupancy is returned as a
 * PERCENT (0–100), ARR/revenue as plain numbers — the same shape the CSV
 * template and the AI path produce.
 */

import { normalizeNumber } from "@/lib/import/parse";

export type Cell = string | number | boolean | null | undefined;

export interface DetectedBaselineRow {
  month: number;
  budgetOcc: number | null;
  budgetArr: number | null;
  budgetRevenue: number | null;
  lastyearOcc: number | null;
  lastyearArr: number | null;
  lastyearRevenue: number | null;
}

const MONTHS: string[] = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const txt = (c: Cell): string => String(c ?? "").trim();
const low = (c: Cell): string => txt(c).toLowerCase();

/** A month cell (name, abbreviation or number 1–12) → month number, else null. */
export function monthToNumber(c: Cell): number | null {
  const s = low(c);
  if (!s) return null;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 12) return n;
  const idx = MONTHS.findIndex((m) => m === s || m.slice(0, 3) === s.slice(0, 3));
  return idx >= 0 ? idx + 1 : null;
}

const isBudget = (c: Cell): boolean => /budget|^plan$|target/.test(low(c));
const isLastYear = (c: Cell): boolean => /last\s*year|^ly$|prior\s*year/.test(low(c));

/**
 * Find the Budget / Last Year table in one sheet grid and extract its monthly
 * rows. Returns [] when no such table is present (the caller tries other sheets
 * / the strict template parser).
 */
export function detectBaselineFromGrid(grid: Cell[][]): DetectedBaselineRow[] {
  // 1. Pick the header row: the one with the most Budget + Last Year labels
  //    (needs at least one of each), which is the Budget/Last-Year sub-header.
  let headerRow = -1;
  let bestScore = 0;
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    let b = 0;
    let l = 0;
    for (const c of row) {
      if (isBudget(c)) b++;
      else if (isLastYear(c)) l++;
    }
    if (b >= 1 && l >= 1 && b + l > bestScore) {
      bestScore = b + l;
      headerRow = i;
    }
  }
  if (headerRow === -1) return [];

  const header = grid[headerRow] ?? [];
  const budgetCols: number[] = [];
  const lyCols: number[] = [];
  header.forEach((c, idx) => {
    if (isBudget(c)) budgetCols.push(idx);
    else if (isLastYear(c)) lyCols.push(idx);
  });

  const pairs = Math.min(budgetCols.length, lyCols.length);
  if (pairs < 1) return [];
  // Columns run left→right as Occupancy, ARR, Revenue (the report's fixed order).
  const col = (arr: number[], i: number): number | null => (i < arr.length ? arr[i]! : null);
  const occB = col(budgetCols, 0);
  const occL = col(lyCols, 0);
  const arrB = col(budgetCols, 1);
  const arrL = col(lyCols, 1);
  const revB = col(budgetCols, 2);
  const revL = col(lyCols, 2);

  // Month column: a header cell saying "month", else the first column.
  let monthCol = header.findIndex((c) => /month/.test(low(c)));
  if (monthCol < 0) monthCol = 0;

  const at = (row: Cell[], c: number | null): number | null =>
    c == null ? null : normalizeNumber(row[c]);

  const out: DetectedBaselineRow[] = [];
  const seen = new Set<number>();
  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const m = monthToNumber(row[monthCol]);
    if (m == null) {
      // Stop once we've collected the year and hit a summary/blank row.
      if (/average|total|grand/.test(low(row[monthCol])) && out.length >= 6) break;
      continue;
    }
    if (seen.has(m)) continue;
    seen.add(m);
    out.push({
      month: m,
      budgetOcc: at(row, occB),
      lastyearOcc: at(row, occL),
      budgetArr: at(row, arrB),
      lastyearArr: at(row, arrL),
      budgetRevenue: at(row, revB),
      lastyearRevenue: at(row, revL),
    });
  }
  return out;
}

/** The six value columns of a baseline preview row (month is separate). */
export const BASELINE_FIELD_KEYS = [
  "budgetOcc", "budgetArr", "budgetRevenue", "lastyearOcc", "lastyearArr", "lastyearRevenue",
] as const;

/** Turn detected rows into the string-keyed preview shape the UI + apply use. */
export function detectedRowsToPreview(rows: DetectedBaselineRow[]): Record<string, string>[] {
  const s = (n: number | null): string => (n == null ? "" : String(n));
  return rows.map((r) => ({
    month: String(r.month),
    budgetOcc: s(r.budgetOcc),
    budgetArr: s(r.budgetArr),
    budgetRevenue: s(r.budgetRevenue),
    lastyearOcc: s(r.lastyearOcc),
    lastyearArr: s(r.lastyearArr),
    lastyearRevenue: s(r.lastyearRevenue),
  }));
}

/**
 * Normalize preview rows (from AI, the deterministic reader, or the template)
 * into at most 12 clean rows — one per valid month (1–12), first occurrence
 * wins, malformed/duplicate/out-of-range rows dropped — so what applies is
 * exactly what the preview shows.
 */
export function cleanBaselineRows(rows: unknown): Record<string, string>[] {
  const arr = Array.isArray(rows) ? rows : [];
  const out: Record<string, string>[] = [];
  const seen = new Set<number>();
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const m = monthToNumber(rec.month as Cell);
    if (m == null || seen.has(m)) continue;
    seen.add(m);
    const s = (v: unknown) => (v == null ? "" : String(v));
    const row: Record<string, string> = { month: String(m) };
    for (const k of BASELINE_FIELD_KEYS) row[k] = s(rec[k]);
    out.push(row);
    if (out.length >= 12) break;
  }
  return out;
}
