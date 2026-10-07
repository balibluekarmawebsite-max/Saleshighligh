"use server";

import { revalidatePath } from "next/cache";
import { WeeklyReportStatus } from "@prisma/client";

import { canEditProperty, getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { OVERVIEW_BLOCKS, isLockedStatus } from "@/lib/weekly/editor-data";
import { weekMeta } from "@/lib/weekly/week";

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const STATUSES = Object.values(WeeklyReportStatus) as string[];

async function findReport(propertyCode: string, week: string) {
  return prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    select: { id: true, status: true },
  });
}

/** Save all 7 Section A overview blocks for a week. (useFormState signature.) */
export async function saveOverview(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have edit access to ${property}.` };
  }
  const report = await findReport(property, week);
  if (!report) return { ok: false, message: "Report not found." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to edit." };
  }

  await prisma.$transaction(
    OVERVIEW_BLOCKS.map((def, i) => {
      const body = String(formData.get(`block_${def.key}`) ?? "").trim();
      return prisma.weeklyOverviewBlock.upsert({
        where: { reportWeekId_key: { reportWeekId: report.id, key: def.key } },
        update: { heading: def.heading, body: body || null, aiDraft: false },
        create: {
          reportWeekId: report.id,
          key: def.key,
          heading: def.heading,
          body: body || null,
          aiDraft: false,
          sortOrder: i,
        },
      });
    }),
  );

  await logAudit("weekly_overview_save", `${property} ${week}`, {});
  revalidatePath(`/weekly/${property}/${week}/editor`);
  return { ok: true, message: "Saved." };
}

/** Advance or reopen a report's status. (Plain form-action signature.) */
export async function setStatus(formData: FormData): Promise<void> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const target = String(formData.get("target") ?? "");
  const user = await getCurrentUser();
  if (!canEditProperty(user, property) || !STATUSES.includes(target)) return;

  const report = await findReport(property, week);
  if (!report) return;

  // Approving, exporting, or changing a locked report requires an admin.
  const sensitive =
    target === "APPROVED" || target === "EXPORTED" || isLockedStatus(report.status);
  if (sensitive && !isAdmin(user)) return;

  await prisma.weeklyReport.update({
    where: { id: report.id },
    data: {
      status: target as WeeklyReportStatus,
      lockedAt: target === "APPROVED" ? new Date() : isLockedStatus(target) ? undefined : null,
      exportedAt: target === "EXPORTED" ? new Date() : undefined,
    },
  });

  await logAudit("weekly_status", `${property} ${week}`, { status: target });
  revalidatePath(`/weekly/${property}/${week}/editor`);
  revalidatePath(`/weekly/${property}/${week}/reports`);
}

/** Create a draft report for a week if it doesn't exist. (Plain form-action.) */
export async function createWeek(formData: FormData): Promise<void> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) return;

  const prop = await prisma.property.findUnique({
    where: { code: property },
    select: { id: true },
  });
  const meta = weekMeta(week);
  if (!prop || !meta) return;

  const existing = await prisma.weeklyReport.findFirst({
    where: { propertyId: prop.id, startDate: meta.startDate },
  });
  if (!existing) {
    await prisma.weeklyReport.create({
      data: {
        propertyId: prop.id,
        startDate: meta.startDate,
        endDate: meta.endDate,
        year: meta.year,
        weekNumber: meta.weekNumber,
        label: meta.label,
        status: "DRAFT",
        ownerId: user && user.id !== "system" ? user.id : null,
      },
    });
    await logAudit("weekly_create", `${property} ${week}`, {});
  }
  revalidatePath(`/weekly/${property}/${week}/reports`);
}
