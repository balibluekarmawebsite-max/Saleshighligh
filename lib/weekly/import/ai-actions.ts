"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isLockedStatus } from "@/lib/weekly/editor-data";
import { applyImportRows, type ImportRow } from "@/lib/weekly/import/apply-core";
import { getAiImportSection } from "@/lib/weekly/import/ai-sections";

export interface AiApplyResult {
  ok: boolean;
  written?: number;
  message?: string;
}

/** Write previewed AI-import rows for one section (replace-all, scoped). */
export async function applyAiImport(input: {
  property: string;
  week: string;
  section: string;
  rows: ImportRow[];
  year?: number;
  platform?: string;
}): Promise<AiApplyResult> {
  const property = input.property.toUpperCase();
  const week = input.week;
  const section = getAiImportSection(input.section);
  if (!section) return { ok: false, message: "Unknown section." };

  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have import access to ${property}.` };
  }
  const report = await prisma.weeklyReport.findFirst({
    where: { property: { code: property }, endDate: new Date(`${week}T00:00:00.000Z`) },
    select: { id: true, status: true, propertyId: true },
  });
  if (!report) return { ok: false, message: "Report not found." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to import." };
  }

  let written: number;
  try {
    written = await applyImportRows({
      reportId: report.id,
      propertyId: report.propertyId,
      sectionId: section.id,
      rows: Array.isArray(input.rows) ? input.rows : [],
      year: input.year,
      platform: input.platform,
      actorUserId: user?.id ?? null,
      source: "ai",
      originalFilename: `ai-import:${section.id}`,
      periodLabel: week,
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Import failed." };
  }

  await logAudit("weekly_ai_import", `${property} ${week}`, { section: section.id, rows: written });
  revalidatePath(`/weekly/${property}/${week}/import`);
  revalidatePath(`/weekly/${property}/${week}/editor`);
  revalidatePath(`/weekly/${property}/${week}/dashboard`);
  return { ok: true, written };
}
