import * as XLSX from "xlsx";

import {
  DOMAINS,
  META_TAB,
  TEMPLATE_VERSION,
  type ColumnSpec,
  type DomainSpec,
} from "./schema";

export interface ValidationIssue {
  tab: string;
  row: number | null; // 1-based Excel row (includes header), null for tab-level
  column: string | null;
  problem: string;
  severity: "error" | "warning";
}

export interface ParsedDomain {
  tab: string;
  model: string;
  fixed?: Record<string, string>;
  singleton?: boolean;
  rows: Record<string, unknown>[];
}

export interface ParseResult {
  meta: {
    propertyCode: string | null;
    period: string | null; // "YYYY-MM"
    templateVersion: string | null;
  };
  domains: ParsedDomain[];
  counts: Record<string, number>;
  issues: ValidationIssue[];
  ok: boolean;
}

/**
 * Normalize a numeric cell, tolerating Indonesian (1.234.567,89) and US
 * (1,234,567.89) formatting, currency symbols, and whitespace. Returns null for
 * empty/unparseable input.
 */
export function normalizeNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  s = s.replace(/[^0-9.,-]/g, ""); // strip Rp, %, spaces
  if (s === "" || s === "-") return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    // Both separators: the later one is the decimal separator.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(/,/g, "."); // Indonesian
    } else {
      s = s.replace(/,/g, ""); // US thousands
    }
  } else if (lastComma !== -1) {
    // Only commas → treat as decimal (Indonesian).
    s = s.replace(/,/g, ".");
  } else if (lastDot !== -1) {
    // Only dots: one dot with 1–2 trailing digits is a decimal; otherwise
    // dots are thousand separators (Indonesian).
    const parts = s.split(".");
    const tail = parts[parts.length - 1] ?? "";
    if (!(parts.length === 2 && tail.length > 0 && tail.length <= 2)) {
      s = s.replace(/\./g, "");
    }
  }

  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}

function toDateString(raw: unknown): string | null {
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  const s = String(raw ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function cellEmpty(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

/** Read the hidden _meta tab (key in col A, value in col B). */
function readMeta(wb: XLSX.WorkBook): ParseResult["meta"] {
  const meta: ParseResult["meta"] = {
    propertyCode: null,
    period: null,
    templateVersion: null,
  };
  const ws = wb.Sheets[META_TAB];
  if (!ws) return meta;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  for (const row of rows) {
    const key = String(row[0] ?? "").trim().toLowerCase();
    const value = row[1] === null || row[1] === undefined ? null : String(row[1]).trim();
    if (key === "property") meta.propertyCode = value;
    else if (key === "period") meta.period = value;
    else if (key === "templateversion") meta.templateVersion = value;
  }
  return meta;
}

function coerceCell(
  value: unknown,
  col: ColumnSpec,
  ctx: { tab: string; row: number },
  issues: ValidationIssue[],
): unknown {
  const empty = cellEmpty(value);
  if (empty) {
    if (col.required) {
      issues.push({ tab: ctx.tab, row: ctx.row, column: col.header, problem: "Required value is missing", severity: "error" });
    }
    return null;
  }

  switch (col.type) {
    case "string":
      return String(value).trim();
    case "enum": {
      const v = String(value).trim().toUpperCase();
      if (!col.enumValues?.includes(v)) {
        issues.push({ tab: ctx.tab, row: ctx.row, column: col.header, problem: `Invalid value "${value}". Allowed: ${col.enumValues?.join(", ")}`, severity: "error" });
        return null;
      }
      return v;
    }
    case "date": {
      const d = toDateString(value);
      if (!d) {
        issues.push({ tab: ctx.tab, row: ctx.row, column: col.header, problem: `Invalid date "${value}" (expected YYYY-MM-DD)`, severity: "error" });
        return null;
      }
      return d;
    }
    case "boolean": {
      const v = String(value).trim().toLowerCase();
      return v === "true" || v === "1" || v === "yes";
    }
    case "int":
    case "decimal":
    case "percent": {
      const n = normalizeNumber(value);
      if (n === null) {
        issues.push({ tab: ctx.tab, row: ctx.row, column: col.header, problem: `"${value}" is not a number`, severity: "error" });
        return null;
      }
      if (col.type === "int" && !Number.isInteger(n)) {
        issues.push({ tab: ctx.tab, row: ctx.row, column: col.header, problem: `Expected a whole number, got ${n}`, severity: "error" });
        return null;
      }
      if (!col.allowNegative && n < 0) {
        issues.push({ tab: ctx.tab, row: ctx.row, column: col.header, problem: `Negative value not allowed (${n})`, severity: "error" });
        return null;
      }
      return n;
    }
    default:
      return value;
  }
}

function parseDomain(
  wb: XLSX.WorkBook,
  domain: DomainSpec,
  issues: ValidationIssue[],
): ParsedDomain | null {
  const ws = wb.Sheets[domain.tab];
  if (!ws) {
    issues.push({ tab: domain.tab, row: null, column: null, problem: "Tab not found — skipped (existing data untouched)", severity: "warning" });
    return null;
  }

  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: null,
  });
  if (grid.length === 0) {
    return { tab: domain.tab, model: domain.model, fixed: domain.fixed, singleton: domain.singleton, rows: [] };
  }

  // Map expected columns to their index by header name.
  const headerRow = (grid[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
  const colIndex = new Map<string, number>();
  let headersOk = true;
  for (const col of domain.columns) {
    const idx = headerRow.indexOf(col.header.toLowerCase());
    if (idx === -1) {
      if (col.required) {
        issues.push({ tab: domain.tab, row: 1, column: col.header, problem: "Required column missing from header row", severity: "error" });
        headersOk = false;
      }
    } else {
      colIndex.set(col.key, idx);
    }
  }
  if (!headersOk) {
    return { tab: domain.tab, model: domain.model, fixed: domain.fixed, singleton: domain.singleton, rows: [] };
  }

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r] ?? [];
    // Skip rows where every mapped cell is empty.
    const anyValue = domain.columns.some((c) => {
      const i = colIndex.get(c.key);
      return i !== undefined && !cellEmpty(raw[i]);
    });
    if (!anyValue) continue;

    const excelRow = r + 1;
    const record: Record<string, unknown> = { ...domain.fixed };
    for (const col of domain.columns) {
      const i = colIndex.get(col.key);
      const value = i === undefined ? null : raw[i];
      const coerced = coerceCell(value, col, { tab: domain.tab, row: excelRow }, issues);
      if (coerced !== null) record[col.key] = coerced;
    }
    rows.push(record);
  }

  if (domain.singleton && rows.length > 1) {
    issues.push({ tab: domain.tab, row: null, column: null, problem: `Only one row allowed; found ${rows.length}. Extra rows ignored.`, severity: "warning" });
    rows.length = 1;
  }

  return { tab: domain.tab, model: domain.model, fixed: domain.fixed, singleton: domain.singleton, rows };
}

export function parseWorkbook(
  data: ArrayBuffer | Uint8Array | Buffer,
  opts: { expectedProperty?: string; expectedPeriod?: string } = {},
): ParseResult {
  const wb = XLSX.read(data, { type: "buffer", cellDates: true });
  const issues: ValidationIssue[] = [];
  const meta = readMeta(wb);

  if (!wb.Sheets[META_TAB]) {
    issues.push({ tab: META_TAB, row: null, column: null, problem: "Missing _meta tab — is this a BK template?", severity: "error" });
  }
  if (meta.templateVersion && meta.templateVersion !== TEMPLATE_VERSION) {
    issues.push({ tab: META_TAB, row: null, column: null, problem: `Template version ${meta.templateVersion} differs from expected ${TEMPLATE_VERSION}`, severity: "warning" });
  }
  if (opts.expectedProperty && meta.propertyCode && meta.propertyCode !== opts.expectedProperty) {
    issues.push({ tab: META_TAB, row: null, column: null, problem: `Property in file (${meta.propertyCode}) does not match selection (${opts.expectedProperty})`, severity: "error" });
  }
  if (opts.expectedPeriod && meta.period && meta.period !== opts.expectedPeriod) {
    issues.push({ tab: META_TAB, row: null, column: null, problem: `Period in file (${meta.period}) does not match selection (${opts.expectedPeriod})`, severity: "error" });
  }

  const domains: ParsedDomain[] = [];
  const counts: Record<string, number> = {};
  for (const spec of DOMAINS) {
    const parsed = parseDomain(wb, spec, issues);
    if (parsed) {
      domains.push(parsed);
      counts[spec.tab] = parsed.rows.length;
    }
  }

  const ok = !issues.some((i) => i.severity === "error");
  return { meta, domains, counts, issues, ok };
}
