/**
 * Token-gated data-push orchestrator.
 *
 * Powers `POST /api/import` (see app/api/import/route.ts), the endpoint the VHP
 * scraper posts a section's CSV export to. It mirrors the interactive "Process
 * with AI" flow, but in one shot and without a signed-in user: resolve the
 * section + property + week, find-or-create the week's DRAFT report, extract the
 * rows with the same Groq pipeline, and write them (replace-all) via the shared
 * core. The HTTP route handles the shared-secret check; this function assumes
 * the caller is already authorised.
 */

import { revalidatePath } from "next/cache";

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isLockedStatus } from "@/lib/weekly/editor-data";
import { applyImportRows } from "@/lib/weekly/import/apply-core";
import { extractSectionRows, type ExtractFile } from "@/lib/weekly/import/extract";
import { resolveSection } from "@/lib/weekly/import/section-resolve";
import { isWeekId, weekMeta } from "@/lib/weekly/week";

export interface ApiImportInput {
  property: string;
  section: string;
  weekEnding: string;
  file?: ExtractFile | null;
  text?: string;
  year?: number;
  platform?: string;
  /** Free-text origin for logs, e.g. "vhp:reservation-by-creation-date". */
  source?: string;
}

export interface ApiImportResult {
  status: number;
  body:
    | { ok: true; property: string; week_ending: string; section: string; written: number; created: boolean; message: string }
    | { ok: false; error: string };
}

const fail = (status: number, error: string): ApiImportResult => ({ status, body: { ok: false, error } });

/**
 * Run a token-authorised section import. Returns an HTTP status + JSON body
 * matching the push contract. Never throws — all failures become a result.
 */
export async function runApiImport(input: ApiImportInput): Promise<ApiImportResult> {
  const property = input.property.trim().toUpperCase();
  const weekEnding = input.weekEnding.trim();

  if (!property) return fail(400, "property is required.");
  if (!isWeekId(weekEnding)) return fail(400, "week_ending must be a valid date (YYYY-MM-DD).");
  const meta = weekMeta(weekEnding);
  if (!meta) return fail(400, `invalid week_ending "${weekEnding}".`);

  const resolved = resolveSection(input.section);
  if ("error" in resolved) return fail(400, resolved.error);
  const section = resolved;
  const sectionLabel = section.completionKey;

  const year = input.year ?? (section.needsYear ? meta.year : undefined);
  if (section.needsYear && (!year || !Number.isInteger(year))) {
    return fail(400, "a valid year is required for this section.");
  }

  const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
  if (!prop) return fail(400, `unknown property "${property}".`);

  // Find-or-create the week's report (DRAFT if the team hasn't opened it yet).
  let created = false;
  let report = await prisma.weeklyReport.findFirst({
    where: { propertyId: prop.id, startDate: meta.startDate },
    select: { id: true, status: true, propertyId: true },
  });
  if (!report) {
    report = await prisma.weeklyReport.create({
      data: {
        propertyId: prop.id,
        startDate: meta.startDate,
        endDate: meta.endDate,
        year: meta.year,
        weekNumber: meta.weekNumber,
        label: meta.label,
        status: "DRAFT",
      },
      select: { id: true, status: true, propertyId: true },
    });
    created = true;
  }

  if (isLockedStatus(report.status)) {
    return fail(409, `report ${property} ${weekEnding} is ${report.status.toLowerCase()} — reopen it to accept imports.`);
  }

  const extracted = await extractSectionRows(section, {
    file: input.file ?? null,
    text: input.text,
    year,
    platform: input.platform,
  });
  if (!extracted.ok) return fail(extracted.status, extracted.error);

  // Safety: never replace a populated section with nothing. If extraction found
  // no rows (bad file / parse miss), leave the existing data in place.
  if (extracted.rows.length === 0) {
    return fail(422, "no rows could be extracted from the file — existing data left unchanged.");
  }

  let written: number;
  try {
    written = await applyImportRows({
      reportId: report.id,
      propertyId: report.propertyId,
      sectionId: section.id,
      rows: extracted.rows,
      year,
      platform: input.platform,
      actorUserId: null,
      source: "api",
      originalFilename: input.file?.filename ?? input.source ?? `api:${section.id}`,
      periodLabel: weekEnding,
    });
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : "import failed.");
  }

  await logAudit("weekly_api_import", `${property} ${weekEnding}`, {
    section: section.id,
    rows: written,
    created,
    source: input.source ?? null,
  }).catch(() => {});

  revalidatePath(`/weekly/${property}/${weekEnding}/import`);
  revalidatePath(`/weekly/${property}/${weekEnding}/editor`);
  revalidatePath(`/weekly/${property}/${weekEnding}/dashboard`);

  return {
    status: 200,
    body: {
      ok: true,
      property,
      week_ending: weekEnding,
      section: sectionLabel,
      written,
      created,
      message: `Section ${sectionLabel} updated`,
    },
  };
}
