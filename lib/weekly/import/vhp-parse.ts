/**
 * Deterministic parsers for known VHP CSV exports.
 *
 * The VHP "Reservation By Creation Date" export is a RAW list — one row per
 * room booking, with report-title lines at the top and fully-quoted CSV. For
 * Section C (market-segment production) the dashboard needs it AGGREGATED by
 * segment. Doing that in code is instant and exact (it reads the whole file and
 * sums precisely), unlike the AI path which truncates large inputs and so can
 * under-count. The token push tries this first and falls back to the AI only
 * when the file isn't a recognised VHP layout.
 *
 * Business rules (Section C):
 *   • group by the "Segment" column;
 *   • room nights  = Night × Room Quantity, summed;
 *   • revenue      = sum of "Total Revenue";
 *   • exclude rows whose Status is Cancelled / No-show (not production);
 *   • only count numbered data rows (skips titles, repeated headers, totals).
 */

import type { ImportRow } from "@/lib/weekly/import/apply-core";
import type { ExtractFile } from "@/lib/weekly/import/extract";

/** Parse CSV text (RFC-4180-ish: quoted fields, embedded commas/quotes/newlines). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let sawField = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
      sawField = true;
    } else if (c === ",") {
      row.push(field); field = ""; sawField = true;
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = ""; sawField = false;
    } else if (c !== "\r") {
      field += c; sawField = true;
    }
  }
  if (sawField || field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

/** Money like "21,600,000.00" → 21600000 (null-safe, 0 on junk). */
function toMoney(s: string | undefined): number {
  const n = Number((s ?? "").replace(/[,\s"]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
/** Integer like "6" → 6 (0 on junk). */
function toInt(s: string | undefined): number {
  const n = parseInt((s ?? "").replace(/[,\s]/g, ""), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Aggregate a VHP "Reservation By Creation Date" CSV into Section C segment
 * rows. Returns null if the text isn't that report (so the caller falls back
 * to the AI extractor).
 */
export function parseVhpReservationsToSegments(text: string): ImportRow[] | null {
  const rows = parseCsv(text);
  if (rows.length === 0) return null;

  // Find the column header row (the real one, below the report title lines).
  const headerIdx = rows.findIndex((r) => {
    const set = new Set(r.map(norm));
    return set.has("segment") && set.has("total revenue") && set.has("night");
  });
  if (headerIdx < 0) return null;

  const header = rows[headerIdx]!.map(norm);
  const col = (name: string) => header.indexOf(name);
  const iNo = col("no");
  const iSeg = col("segment");
  const iNight = col("night");
  const iQty = col("room quantity");
  const iRev = col("total revenue");
  const iStatus = col("status");
  if (iSeg < 0 || iNight < 0 || iRev < 0) return null;

  const agg = new Map<string, { rn: number; rev: number }>();
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]!;
    // Data rows are numbered 1,2,3…; this skips titles, repeated headers,
    // page breaks and totals rows in one go.
    if (iNo >= 0 && toInt(r[iNo]) <= 0) continue;
    const seg = (r[iSeg] ?? "").trim();
    if (!seg) continue;
    const status = norm(r[iStatus]);
    if (status.includes("cancel") || status.includes("no show") || status.includes("noshow")) continue;

    const nights = toInt(r[iNight]);
    const qty = iQty >= 0 ? toInt(r[iQty]) : 1;
    const cur = agg.get(seg) ?? { rn: 0, rev: 0 };
    cur.rn += nights * qty; // room-nights = nights × rooms (0 for cancelled/companion lines)
    cur.rev += toMoney(r[iRev]);
    agg.set(seg, cur);
  }

  if (agg.size === 0) return null;
  return [...agg.entries()]
    .map(([label, v]) => ({ label, rnSold: String(v.rn), grossRevenue: String(v.rev) }))
    .sort((a, b) => Number(b.grossRevenue) - Number(a.grossRevenue));
}

/**
 * Try a deterministic parse for a known VHP CSV export. Returns rows on a
 * confident match, or null to fall back to the AI extractor. Only CSV/text
 * files are attempted (xlsx and unknown layouts fall through to AI).
 */
export function tryVhpParse(sectionId: string, file: ExtractFile): ImportRow[] | null {
  if (/\.(xlsx|xls)$/i.test(file.filename)) return null;
  const type = (file.type || "").toLowerCase();
  const looksText =
    /\.csv$/i.test(file.filename) || type.includes("csv") || type.includes("text") || type === "" || type.includes("octet-stream");
  if (!looksText) return null;

  let text: string;
  try {
    text = file.buffer.toString("utf8");
  } catch {
    return null;
  }

  if (sectionId === "segment") return parseVhpReservationsToSegments(text);
  return null;
}
