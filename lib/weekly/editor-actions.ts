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

const str = (v: unknown): string | null => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};
const int = (v: unknown): number | null => {
  const s = (v ?? "").toString().trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Replace all rows for one Department Inputs section. (useFormState signature.) */
export async function saveSection(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const sectionId = String(formData.get("sectionId") ?? "");
  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have edit access to ${property}.` };
  }
  const report = await findReport(property, week);
  if (!report) return { ok: false, message: "Report not found." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to edit." };
  }

  let rows: Record<string, string>[];
  try {
    const parsed: unknown = JSON.parse(String(formData.get("rows") ?? "[]"));
    rows = Array.isArray(parsed) ? (parsed as Record<string, string>[]) : [];
  } catch {
    return { ok: false, message: "Could not read the rows." };
  }

  const rid = report.id;
  await prisma.$transaction(async (tx) => {
    switch (sectionId) {
      case "sales":
      case "ecommerce": {
        await tx.weeklyActivity.deleteMany({ where: { reportWeekId: rid, department: sectionId } });
        const data = rows
          .filter((r) => str(r.title))
          .map((r, i) => ({
            reportWeekId: rid,
            department: sectionId,
            dateLabel: str(r.dateLabel),
            title: str(r.title),
            notes: str(r.notes),
            sortOrder: i,
          }));
        if (data.length) await tx.weeklyActivity.createMany({ data });
        break;
      }
      case "social": {
        await tx.weeklySocialMetric.deleteMany({ where: { reportWeekId: rid } });
        const data = rows
          .filter((r) => str(r.metricKey))
          .map((r, i) => ({
            reportWeekId: rid,
            platform: str(r.platform) ?? "Instagram",
            metricKey: str(r.metricKey) as string,
            lastWeek: int(r.lastWeek),
            thisWeek: int(r.thisWeek),
            sortOrder: i,
          }));
        if (data.length) await tx.weeklySocialMetric.createMany({ data });
        break;
      }
      case "trainings": {
        await tx.weeklyTraining.deleteMany({ where: { reportWeekId: rid } });
        const data = rows
          .filter((r) => str(r.topic))
          .map((r, i) => ({
            reportWeekId: rid,
            dateLabel: str(r.dateLabel),
            topic: str(r.topic) as string,
            duration: str(r.duration),
            trainer: str(r.trainer),
            participants: str(r.participants),
            sortOrder: i,
          }));
        if (data.length) await tx.weeklyTraining.createMany({ data });
        break;
      }
      case "action_plans": {
        await tx.weeklyActionPlan.deleteMany({ where: { reportWeekId: rid } });
        const data = rows
          .filter((r) => str(r.plan))
          .map((r, i) => ({
            reportWeekId: rid,
            category: str(r.category),
            plan: str(r.plan) as string,
            startLabel: str(r.startLabel),
            deadlineLabel: str(r.deadlineLabel),
            remark: str(r.remark),
            sortOrder: i,
          }));
        if (data.length) await tx.weeklyActionPlan.createMany({ data });
        break;
      }
      default:
        throw new Error(`Unknown section: ${sectionId}`);
    }
  });

  await logAudit("weekly_section_save", `${property} ${week}`, { section: sectionId });
  revalidatePath(`/weekly/${property}/${week}/departments`);
  return { ok: true, message: "Saved." };
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
