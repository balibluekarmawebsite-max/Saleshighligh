/**
 * Weekly import: per-section CSV/Excel upload for the tabular sections (B, C,
 * D, E/F). Each section has a column spec that drives both the downloadable
 * template and the parser. The parser is pure (takes already-read records);
 * the SheetJS read + the database write live in import-actions.ts.
 */

export type WeeklyImportSectionId = "monthly" | "segment" | "ratecode" | "channel";

export type ColType = "int" | "number" | "string";

export interface ImportColumn {
  /** CSV/Excel header. */
  header: string;
  /** Prisma field name the value maps to. */
  key: string;
  type: ColType;
  required?: boolean;
  /** Entered as a percent (0–100); stored as a fraction (÷100) on apply. */
  percent?: boolean;
  min?: number;
  max?: number;
}

export interface ImportSpec {
  id: WeeklyImportSectionId;
  title: string;
  hint: string;
  columns: ImportColumn[];
}

export interface ParseIssue {
  row: number;
  message: string;
}

export interface ParseResult {
  sectionId: string;
  title: string;
  rowCount: number;
  rows: Record<string, number | string | null>[];
  issues: ParseIssue[];
  ok: boolean;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export const IMPORT_SPECS: ImportSpec[] = [
  {
    id: "monthly",
    title: "Section B — Monthly (Actual / Budget / Last Year)",
    hint: "One row per month (1–12). Occupancy columns are percentages, e.g. 77.0.",
    columns: [
      { header: "month", key: "month", type: "int", required: true, min: 1, max: 12 },
      { header: "rn_sold", key: "rnSold", type: "int" },
      { header: "occ_actual_pct", key: "occActual", type: "number", percent: true, min: 0, max: 100 },
      { header: "occ_budget_pct", key: "occBudget", type: "number", percent: true, min: 0, max: 100 },
      { header: "occ_ly_pct", key: "occLy", type: "number", percent: true, min: 0, max: 100 },
      { header: "arr_actual", key: "arrActual", type: "number" },
      { header: "arr_budget", key: "arrBudget", type: "number" },
      { header: "arr_ly", key: "arrLy", type: "number" },
      { header: "rev_actual", key: "revActual", type: "number" },
      { header: "rev_budget", key: "revBudget", type: "number" },
      { header: "rev_ly", key: "revLy", type: "number" },
    ],
  },
  {
    id: "segment",
    title: "Section C — Weekly Market Segment",
    hint: "One row per segment for the week.",
    columns: [
      { header: "label", key: "label", type: "string", required: true },
      { header: "segment_group", key: "segmentGroup", type: "string" },
      { header: "rn_sold", key: "rnSold", type: "int" },
      { header: "gross_revenue", key: "grossRevenue", type: "number" },
    ],
  },
  {
    id: "ratecode",
    title: "Section D — Rate Code / Promotion",
    hint: "One row per rate code / promotion.",
    columns: [
      { header: "label", key: "label", type: "string", required: true },
      { header: "rn_sold", key: "rnSold", type: "int" },
      { header: "gross_revenue", key: "grossRevenue", type: "number" },
    ],
  },
  {
    id: "channel",
    title: "Sections E/F — Channel Inside (Room Nights)",
    hint: "One row per source per year, with the 12 month columns (room nights).",
    columns: [
      { header: "year", key: "year", type: "int", required: true, min: 2000, max: 2100 },
      { header: "source_label", key: "sourceLabel", type: "string", required: true },
      ...MONTHS.map((m): ImportColumn => ({ header: m, key: m, type: "int" })),
    ],
  },
];

export function getImportSpec(sectionId: string): ImportSpec | undefined {
  return IMPORT_SPECS.find((s) => s.id === sectionId);
}

/** A header-only CSV template for a section. */
export function csvTemplate(spec: ImportSpec): string {
  return spec.columns.map((c) => c.header).join(",") + "\n";
}

/** Validate + coerce already-read records against a section's spec. */
export function parseWeeklyRows(
  sectionId: string,
  records: Record<string, unknown>[],
): ParseResult {
  const spec = getImportSpec(sectionId);
  if (!spec) {
    return { sectionId, title: sectionId, rowCount: 0, rows: [], issues: [{ row: 0, message: "Unknown section." }], ok: false };
  }

  const rows: Record<string, number | string | null>[] = [];
  const issues: ParseIssue[] = [];

  records.forEach((rec, idx) => {
    const rowNum = idx + 2; // +1 for the header line, +1 to 1-index

    const nonEmpty = spec.columns.some((c) => {
      const v = rec[c.header];
      return v !== null && v !== undefined && String(v).trim() !== "";
    });
    if (!nonEmpty) return; // blank line

    const out: Record<string, number | string | null> = {};
    const rowIssues: string[] = [];

    for (const col of spec.columns) {
      const raw = rec[col.header];
      const empty = raw === null || raw === undefined || String(raw).trim() === "";

      if (col.type === "string") {
        if (empty) {
          if (col.required) rowIssues.push(`${col.header} is required`);
          out[col.key] = null;
        } else {
          out[col.key] = String(raw).trim();
        }
        continue;
      }

      if (empty) {
        if (col.required) rowIssues.push(`${col.header} is required`);
        out[col.key] = null;
        continue;
      }
      const n = Number(String(raw).replace(/,/g, "").trim());
      if (!Number.isFinite(n)) {
        rowIssues.push(`${col.header} "${String(raw)}" is not a number`);
        out[col.key] = null;
      } else if ((col.min !== undefined && n < col.min) || (col.max !== undefined && n > col.max)) {
        rowIssues.push(`${col.header} must be between ${col.min} and ${col.max}`);
        out[col.key] = null;
      } else {
        out[col.key] = col.type === "int" ? Math.round(n) : n;
      }
    }

    if (rowIssues.length) issues.push({ row: rowNum, message: rowIssues.join("; ") });
    else rows.push(out);
  });

  return { sectionId, title: spec.title, rowCount: rows.length, rows, issues, ok: issues.length === 0 };
}
