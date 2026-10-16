/**
 * Deterministic reader for a Sales-Activity (or E-commerce) table embedded in a
 * spreadsheet — no AI required, so nothing is truncated or invented.
 *
 * It reads the report's own "Sales Activity" layout: a header row with Date /
 * Subject / Remarks, then one block per activity — a row carrying the Date (and
 * Subject) followed by any number of Remarks rows that belong to it (the Date
 * cell is merged/blank on those). Blocks are grouped by date, with the remark
 * lines joined into one notes field, producing the same {dateLabel, title,
 * notes} rows the Section G grid and the AI path produce.
 *
 * It is tolerant of layout: it finds the header row by content (not a fixed
 * position), skips the title/blank rows and leading empty columns, reads Excel
 * date serials or date strings, and ignores unrelated sheets (e.g. a "Plan"
 * sheet) by requiring a Subject/Activity column.
 */

import * as XLSX from "xlsx";

export type Cell = string | number | boolean | Date | null | undefined;

export interface ActivityRow {
  dateLabel: string;
  title: string;
  notes: string;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const txt = (c: Cell): string => (c == null ? "" : String(c)).replace(/\s+/g, " ").trim();
const low = (c: Cell): string => txt(c).toLowerCase();

/** Excel date serial (1900 system) → JS Date (UTC), or null if out of range. */
function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmtDate = (d: Date): string => `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** A Date / Excel serial / date string cell → a short label like "9 Oct 2026". */
export function formatDateCell(c: Cell): string {
  if (c == null || c === "") return "";
  if (c instanceof Date) return fmtDate(c);
  if (typeof c === "number") {
    const d = excelSerialToDate(c);
    return d ? fmtDate(d) : String(c);
  }
  // Already a string label (e.g. "9 Oct 2026", "09/10/2026") — keep as typed.
  return txt(c);
}

const isDateHeader = (c: Cell): boolean => /\bdate\b/.test(low(c));
const isSubjectHeader = (c: Cell): boolean => /subject|activity|type|company|partner/.test(low(c));
const isRemarkHeader = (c: Cell): boolean => /remark|note|detail|update|description/.test(low(c));

/**
 * Find the Sales-Activity table in one sheet grid and extract its activity rows.
 * Returns [] when the sheet has no such table (caller tries other sheets / AI).
 */
export function detectSalesActivityFromGrid(grid: Cell[][]): ActivityRow[] {
  // Header row: the first row that has BOTH a Date column and a Subject/Activity
  // column. Requiring Subject avoids matching an unrelated "Plan" table (Start /
  // Deadline / Remark), which has a date but no subject.
  let headerRow = -1;
  let dateCol = -1;
  let subjCol = -1;
  let remCol = -1;
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const dc = row.findIndex(isDateHeader);
    const sc = row.findIndex(isSubjectHeader);
    if (dc >= 0 && sc >= 0) {
      headerRow = i;
      dateCol = dc;
      subjCol = sc;
      remCol = row.findIndex(isRemarkHeader);
      break;
    }
  }
  if (headerRow === -1) return [];
  // Remarks column: the detected one, else the column right after Subject.
  if (remCol < 0) remCol = subjCol + 1;

  const out: ActivityRow[] = [];
  let cur: { dateLabel: string; title: string; notes: string[] } | null = null;
  const flush = () => {
    if (!cur) return;
    const notes = cur.notes.map((n) => n.trim()).filter(Boolean).join("\n");
    if (cur.title || notes) out.push({ dateLabel: cur.dateLabel, title: cur.title, notes });
    cur = null;
  };

  for (let i = headerRow + 1; i < grid.length; i++) {
    const row = grid[i] ?? [];
    const dl = formatDateCell(row[dateCol]);
    const subj = txt(row[subjCol]);
    const rem = txt(row[remCol]);
    if (!dl && !subj && !rem) continue; // blank row

    // A new activity begins on a new date, or a new subject under the same date.
    const startsNew =
      (dl && (!cur || dl !== cur.dateLabel)) ||
      (!cur && (subj !== "" || rem !== "")) ||
      (subj !== "" && cur != null && subj !== cur.title && dl !== "");

    if (startsNew) {
      flush();
      cur = { dateLabel: dl, title: subj, notes: rem ? [rem] : [] };
    } else {
      if (!cur) cur = { dateLabel: dl, title: subj, notes: [] };
      if (!cur.title && subj) cur.title = subj;
      if (!cur.dateLabel && dl) cur.dateLabel = dl;
      if (rem) cur.notes.push(rem);
    }
  }
  flush();
  return out;
}

/**
 * Detect the Sales-Activity table anywhere in a workbook buffer, deterministically.
 * Reads dates as real dates (cellDates), scans every sheet, and returns the first
 * sheet that yields activity rows. Returns [] if none match.
 */
export function detectSalesActivityInWorkbook(buf: Buffer): ActivityRow[] {
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  } catch {
    return [];
  }
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const grid = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, defval: null, blankrows: false });
    const rows = detectSalesActivityFromGrid(grid);
    if (rows.length > 0) return cleanActivityRows(rows);
  }
  return [];
}

/**
 * Normalize activity rows (from the deterministic reader or AI) into clean
 * string-keyed rows: drop empties (no subject and no notes), trim, and cap the
 * count so a runaway sheet can't flood the section.
 */
export function cleanActivityRows(rows: unknown): ActivityRow[] {
  const arr = Array.isArray(rows) ? rows : [];
  const out: ActivityRow[] = [];
  for (const r of arr) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const dateLabel = txt(rec.dateLabel as Cell);
    const title = txt(rec.title as Cell);
    const notes = rec.notes == null ? "" : String(rec.notes).trim();
    if (!title && !notes) continue;
    out.push({ dateLabel, title, notes });
    if (out.length >= 200) break;
  }
  return out;
}
