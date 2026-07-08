"use server";

import { applyImport, ImportLockedError } from "@/lib/import/apply";
import { parseWorkbook, type ValidationIssue } from "@/lib/import/parse";

export interface ValidateResult {
  error?: string;
  fileName?: string;
  meta?: { propertyCode: string | null; period: string | null; templateVersion: string | null };
  counts?: Record<string, number>;
  issues?: ValidationIssue[];
  ok?: boolean;
  totalRows?: number;
}

export interface CommitResult {
  ok: boolean;
  message?: string;
  written?: Record<string, number>;
  issues?: ValidationIssue[];
}

function readForm(formData: FormData) {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const period = String(formData.get("period") ?? "");
  const file = formData.get("file");
  return { property, period, file };
}

/** Parse + validate an uploaded workbook without writing anything. */
export async function validateWorkbook(
  formData: FormData,
): Promise<ValidateResult> {
  const { property, period, file } = readForm(formData);
  if (!property) return { error: "Choose a property." };
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: "Choose a month." };
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Attach an .xlsx file." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseWorkbook(buffer, {
    expectedProperty: property,
    expectedPeriod: period,
  });
  const totalRows = Object.values(parsed.counts).reduce((a, b) => a + b, 0);

  return {
    fileName: file.name,
    meta: parsed.meta,
    counts: parsed.counts,
    issues: parsed.issues,
    ok: parsed.ok,
    totalRows,
  };
}

/** Re-parse and, if clean, write the workbook to the database. */
export async function commitWorkbook(
  formData: FormData,
): Promise<CommitResult> {
  const { property, period, file } = readForm(formData);
  if (!property || !/^\d{4}-\d{2}$/.test(period)) {
    return { ok: false, message: "Missing property or month." };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Attach an .xlsx file." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseWorkbook(buffer, {
    expectedProperty: property,
    expectedPeriod: period,
  });
  if (!parsed.ok) {
    return {
      ok: false,
      message: "Validation errors remain — fix them and re-validate.",
      issues: parsed.issues,
    };
  }

  try {
    const result = await applyImport(parsed, {
      propertyCode: property,
      period,
      fileName: file.name,
    });
    return { ok: true, written: result.written };
  } catch (error) {
    if (error instanceof ImportLockedError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Import failed.",
    };
  }
}
