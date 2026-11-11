/**
 * Parse VHP's "Arrival Guest" report CSV into the raw arrival rows the compiler
 * (compileGuestArrivals) understands. The real export has a 5–6 line preamble
 * (property, address, "Period: …"), then the header row, then one row per
 * guest/room — with big, messy, multi-line quoted "Remark" fields, so a proper
 * RFC-4180 tokeniser is required.
 *
 * Columns used: Nationality (alpha-3), Stay (nights), Arrival/Departure
 * (DD/MM/YY), Adult / Child ("2/1" → 3 guests), Reservation Status (cancelled /
 * no-show rows are dropped). Everything else is ignored.
 */

import type { RawArrival } from "@/lib/sales/guest-arrivals-logic";

/** RFC-4180 CSV → rows of fields. Handles quotes, "" escapes, embedded commas
 * and newlines, and CRLF/CR/LF line endings. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/^﻿/, ""); // strip BOM

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else {
      field += c;
    }
  }
  // flush trailing field/row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const normHeader = (s: string) => s.toLowerCase().replace(/\s+/g, "").replace(/[^a-z/]/g, "");

const num = (v: string): number => {
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** DD/MM/YY (or DD/MM/YYYY) → ISO YYYY-MM-DD; undefined if unparseable. */
function toIsoDate(v: string): string | undefined {
  const m = String(v).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return undefined;
  const dd = m[1]!.padStart(2, "0");
  const mm = m[2]!.padStart(2, "0");
  const yy = m[3]!;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return undefined;
  return `${year}-${mm}-${dd}`;
}

export interface ArrivalGuestCsvResult {
  arrivals: RawArrival[];
  meta: {
    /** "YYYY-MM" from the report's Period line, if found. */
    periodHint: string | null;
    /** BKDS / BKDU / BKV guessed from the address, if recognised. */
    propertyHint: string | null;
    /** Arrival rows kept. */
    rowCount: number;
    /** Rows dropped (cancelled/no-show or missing a nationality). */
    skipped: number;
    headerFound: boolean;
  };
}

const PROPERTY_HINTS: { re: RegExp; code: string }[] = [
  { re: /seminyak/i, code: "BKDS" },
  { re: /ubud/i, code: "BKDU" },
  { re: /village/i, code: "BKV" },
];

/** Parse the Arrival Guest CSV text into raw arrivals + detected period/property. */
export function parseArrivalGuestCsv(text: string): ArrivalGuestCsvResult {
  const rows = parseCsv(text);

  // Find the header row: the one naming Nationality + Stay + Arrival.
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const keys = rows[i]!.map(normHeader);
    if (keys.includes("nationality") && keys.includes("stay") && keys.includes("arrival")) {
      headerIdx = i;
      break;
    }
  }

  // Period + property hints come from the preamble (and anywhere, really).
  let periodHint: string | null = null;
  let propertyHint: string | null = null;
  const preamble = rows.slice(0, headerIdx >= 0 ? headerIdx : rows.length).flat().join(" ");
  const pm = preamble.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})\s*[-–]\s*\d{1,2}\/\d{1,2}\/\d{2,4}/);
  if (pm) {
    const mm = pm[2]!.padStart(2, "0");
    const yy = pm[3]!;
    const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    if (Number(mm) >= 1 && Number(mm) <= 12) periodHint = `${year}-${mm}`;
  }
  for (const h of PROPERTY_HINTS) {
    if (h.re.test(preamble)) {
      propertyHint = h.code;
      break;
    }
  }

  if (headerIdx < 0) {
    return { arrivals: [], meta: { periodHint, propertyHint, rowCount: 0, skipped: 0, headerFound: false } };
  }

  const header = rows[headerIdx]!.map(normHeader);
  const col = (name: string) => header.indexOf(name);
  const iNat = col("nationality");
  const iStay = col("stay");
  const iArr = col("arrival");
  const iDep = col("departure");
  const iAC = col("adult/child");
  const iStatus = col("reservationstatus");

  const arrivals: RawArrival[] = [];
  let skipped = 0;

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]!;
    if (iNat < 0 || iNat >= r.length) {
      continue;
    }
    const country = (r[iNat] ?? "").trim();
    if (!country) {
      continue; // blank line / footer
    }

    const status = iStatus >= 0 ? (r[iStatus] ?? "").trim() : "";
    if (/cancel|no\s*show|void/i.test(status)) {
      skipped += 1;
      continue;
    }

    const stay = iStay >= 0 ? num(r[iStay] ?? "") : 0;
    const arrival = iArr >= 0 ? toIsoDate(r[iArr] ?? "") : undefined;
    const departure = iDep >= 0 ? toIsoDate(r[iDep] ?? "") : undefined;

    let guests: number | undefined;
    if (iAC >= 0) {
      const parts = (r[iAC] ?? "").split("/");
      guests = parts.reduce((s, p) => s + num(p), 0);
    }

    arrivals.push({
      country,
      nights: stay > 0 ? stay : undefined,
      arrival,
      departure,
      rooms: 1,
      guests,
    });
  }

  return {
    arrivals,
    meta: { periodHint, propertyHint, rowCount: arrivals.length, skipped, headerFound: true },
  };
}
