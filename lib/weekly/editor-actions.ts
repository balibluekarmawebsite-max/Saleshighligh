"use server";

import { revalidatePath } from "next/cache";
import { WeeklyReportStatus } from "@prisma/client";

import { canEditProperty, getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { NARRATIVE_MODEL } from "@/lib/weekly/ai-prompts";
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

/**
 * Save a single Section A overview block from the AI drafting flow. Marks the
 * block as `aiDraft` when the text is still the model's output (not yet edited
 * by a human), records a `WeeklyAiDraft` provenance row, and audits the save.
 */
export async function saveWeeklyOverviewBlock(input: {
  property: string;
  week: string;
  key: string;
  body: string;
  aiGenerated: boolean;
}): Promise<ActionResult> {
  const property = input.property.toUpperCase();
  const week = input.week;
  const def = OVERVIEW_BLOCKS.find((b) => b.key === input.key);
  if (!def) return { ok: false, message: "Unknown section." };

  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have edit access to ${property}.` };
  }
  const report = await findReport(property, week);
  if (!report) return { ok: false, message: "Report not found." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to edit." };
  }

  const body = input.body.trim();
  if (!body) return { ok: false, message: "Nothing to save." };

  await prisma.weeklyOverviewBlock.upsert({
    where: { reportWeekId_key: { reportWeekId: report.id, key: def.key } },
    update: { heading: def.heading, body, aiDraft: input.aiGenerated },
    create: {
      reportWeekId: report.id,
      key: def.key,
      heading: def.heading,
      body,
      aiDraft: input.aiGenerated,
      sortOrder: OVERVIEW_BLOCKS.indexOf(def),
    },
  });

  await prisma.weeklyAiDraft.create({
    data: {
      reportWeekId: report.id,
      section: "overview",
      fieldKey: def.key,
      mode: input.aiGenerated ? "ai" : "edited",
      model: NARRATIVE_MODEL,
      output: body,
      status: "saved",
      userId: user && user.id !== "system" ? user.id : null,
    },
  });

  await logAudit("weekly_ai_block_save", `${property} ${week}`, {
    block: def.key,
    ai: input.aiGenerated,
  });
  revalidatePath(`/weekly/${property}/${week}/editor`);
  return { ok: true, message: input.aiGenerated ? "Saved as AI draft." : "Saved." };
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
  const s = (v ?? "").toString().trim().replace(/[,\s]/g, "");
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

/** Money / decimal string → number (strips thousands separators). */
const money = (v: unknown): number | null => {
  const s = (v ?? "").toString().trim().replace(/[,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Percent input (e.g. "77.0") → stored occupancy fraction (0.77), 4 dp. */
const occFrac = (v: unknown): number | null => {
  const s = (v ?? "").toString().trim().replace(/[%\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round((n / 100) * 10000) / 10000;
};

/** Shared write guard: edit access, report exists, not locked. */
async function authReportForWrite(
  property: string,
  week: string,
): Promise<{ error: ActionResult } | { id: string }> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { error: { ok: false, message: `You don't have edit access to ${property}.` } };
  }
  const report = await findReport(property, week);
  if (!report) return { error: { ok: false, message: "Report not found." } };
  if (isLockedStatus(report.status)) {
    return { error: { ok: false, message: "This report is approved/locked — reopen it to edit." } };
  }
  return { id: report.id };
}

function parseRows(formData: FormData, field = "rows"): Record<string, string>[] | null {
  try {
    const parsed: unknown = JSON.parse(String(formData.get(field) ?? "[]"));
    return Array.isArray(parsed) ? (parsed as Record<string, string>[]) : [];
  } catch {
    return null;
  }
}

/** Section B — replace the 12-month Actual/Budget/LY grid. */
export async function saveMonthlyStats(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const guard = await authReportForWrite(property, week);
  if ("error" in guard) return guard.error;
  const rows = parseRows(formData);
  if (!rows) return { ok: false, message: "Could not read the rows." };

  const data = rows
    .map((r) => ({
      reportWeekId: guard.id,
      month: Number(r.month),
      rnSold: int(r.rnSold),
      occActual: occFrac(r.occActual),
      occBudget: occFrac(r.occBudget),
      occLy: occFrac(r.occLy),
      arrActual: money(r.arrActual),
      arrBudget: money(r.arrBudget),
      arrLy: money(r.arrLy),
      revActual: money(r.revActual),
      revBudget: money(r.revBudget),
      revLy: money(r.revLy),
    }))
    .filter(
      (r) =>
        Number.isInteger(r.month) &&
        r.month >= 1 &&
        r.month <= 12 &&
        [
          r.rnSold, r.occActual, r.occBudget, r.occLy,
          r.arrActual, r.arrBudget, r.arrLy, r.revActual, r.revBudget, r.revLy,
        ].some((v) => v != null),
    );

  await prisma.$transaction(async (tx) => {
    await tx.weeklyMonthlyStat.deleteMany({ where: { reportWeekId: guard.id } });
    if (data.length) await tx.weeklyMonthlyStat.createMany({ data });
  });

  await logAudit("weekly_monthly_save", `${property} ${week}`, { rows: data.length });
  revalidatePath(`/weekly/${property}/${week}/editor`);
  return { ok: true, message: "Saved." };
}

/** Section C — replace the weekly market-segment production grid. */
export async function saveSegments(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const guard = await authReportForWrite(property, week);
  if ("error" in guard) return guard.error;
  const rows = parseRows(formData);
  if (!rows) return { ok: false, message: "Could not read the rows." };

  const data = rows
    .filter((r) => str(r.label))
    .map((r, i) => ({
      reportWeekId: guard.id,
      label: str(r.label) as string,
      segmentGroup: str(r.segmentGroup),
      rnSold: int(r.rnSold),
      grossRevenue: money(r.grossRevenue),
      sortOrder: i,
    }));

  await prisma.$transaction(async (tx) => {
    await tx.weeklySegmentProduction.deleteMany({ where: { reportWeekId: guard.id } });
    if (data.length) await tx.weeklySegmentProduction.createMany({ data });
  });

  await logAudit("weekly_segments_save", `${property} ${week}`, { rows: data.length });
  revalidatePath(`/weekly/${property}/${week}/editor`);
  return { ok: true, message: "Saved." };
}

/** Section D — replace the rate-code / promotion production grid. */
export async function saveRateCodes(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const guard = await authReportForWrite(property, week);
  if ("error" in guard) return guard.error;
  const rows = parseRows(formData);
  if (!rows) return { ok: false, message: "Could not read the rows." };

  const data = rows
    .filter((r) => str(r.label))
    .map((r, i) => ({
      reportWeekId: guard.id,
      label: str(r.label) as string,
      rnSold: int(r.rnSold),
      grossRevenue: money(r.grossRevenue),
      sortOrder: i,
    }));

  await prisma.$transaction(async (tx) => {
    await tx.weeklyRateCodeProduction.deleteMany({ where: { reportWeekId: guard.id } });
    if (data.length) await tx.weeklyRateCodeProduction.createMany({ data });
  });

  await logAudit("weekly_ratecodes_save", `${property} ${week}`, { rows: data.length });
  revalidatePath(`/weekly/${property}/${week}/editor`);
  return { ok: true, message: "Saved." };
}

/** Sections E/F — replace one year's channel room-night grid (other years kept). */
export async function saveChannels(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const year = Number(formData.get("year"));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, message: "Invalid year." };
  }
  const guard = await authReportForWrite(property, week);
  if ("error" in guard) return guard.error;
  const rows = parseRows(formData);
  if (!rows) return { ok: false, message: "Could not read the rows." };

  const m = (v: unknown): number => int(v) ?? 0;
  const seen = new Set<string>();
  const data = rows
    .filter((r) => {
      const label = str(r.sourceLabel);
      if (!label || seen.has(label)) return false;
      seen.add(label);
      return true;
    })
    .map((r, i) => ({
      reportWeekId: guard.id,
      year,
      sourceLabel: str(r.sourceLabel) as string,
      jan: m(r.jan), feb: m(r.feb), mar: m(r.mar), apr: m(r.apr),
      may: m(r.may), jun: m(r.jun), jul: m(r.jul), aug: m(r.aug),
      sep: m(r.sep), oct: m(r.oct), nov: m(r.nov), dec: m(r.dec),
      sortOrder: i,
    }));

  await prisma.$transaction(async (tx) => {
    await tx.weeklyChannelRn.deleteMany({ where: { reportWeekId: guard.id, year } });
    if (data.length) await tx.weeklyChannelRn.createMany({ data });
  });

  await logAudit("weekly_channels_save", `${property} ${week}`, { year, rows: data.length });
  revalidatePath(`/weekly/${property}/${week}/editor`);
  return { ok: true, message: "Saved." };
}

/** Section H — replace one platform's social metrics (other platforms kept). */
export async function saveWeeklySocial(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const platform = str(formData.get("platform")) ?? "Instagram";
  const guard = await authReportForWrite(property, week);
  if ("error" in guard) return guard.error;
  const rows = parseRows(formData);
  if (!rows) return { ok: false, message: "Could not read the rows." };

  const data = rows
    .filter((r) => str(r.metricKey) && (int(r.lastWeek) != null || int(r.thisWeek) != null))
    .map((r, i) => ({
      reportWeekId: guard.id,
      platform,
      metricKey: str(r.metricKey) as string,
      lastWeek: int(r.lastWeek),
      thisWeek: int(r.thisWeek),
      sortOrder: i,
    }));

  await prisma.$transaction(async (tx) => {
    await tx.weeklySocialMetric.deleteMany({ where: { reportWeekId: guard.id, platform } });
    if (data.length) await tx.weeklySocialMetric.createMany({ data });
  });

  await logAudit("weekly_social_save", `${property} ${week}`, { platform, rows: data.length });
  revalidatePath(`/weekly/${property}/${week}/editor`);
  return { ok: true, message: "Saved." };
}

/** Owner Overview — replace both the repeater-guest and channel-mix grids. */
export async function saveOwnerOverview(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const guard = await authReportForWrite(property, week);
  if ("error" in guard) return guard.error;
  const repeaters = parseRows(formData, "repeaters");
  const mix = parseRows(formData, "mix");
  if (!repeaters || !mix) return { ok: false, message: "Could not read the rows." };

  const repData = repeaters
    .filter((r) => str(r.label))
    .map((r, i) => ({
      reportWeekId: guard.id,
      label: str(r.label) as string,
      roomNights: int(r.roomNights),
      revenue: money(r.revenue),
      sortOrder: i,
    }));
  const mixData = mix
    .filter((r) => str(r.label))
    .map((r, i) => ({
      reportWeekId: guard.id,
      label: str(r.label) as string,
      rnSold: int(r.rnSold),
      grossRevenue: money(r.grossRevenue),
      sortOrder: i,
    }));

  await prisma.$transaction(async (tx) => {
    await tx.weeklyOwnerRepeater.deleteMany({ where: { reportWeekId: guard.id } });
    if (repData.length) await tx.weeklyOwnerRepeater.createMany({ data: repData });
    await tx.weeklyOwnerChannelMix.deleteMany({ where: { reportWeekId: guard.id } });
    if (mixData.length) await tx.weeklyOwnerChannelMix.createMany({ data: mixData });
  });

  await logAudit("weekly_owner_save", `${property} ${week}`, {
    repeaters: repData.length,
    mix: mixData.length,
  });
  revalidatePath(`/weekly/${property}/${week}/editor`);
  return { ok: true, message: "Saved." };
}

/** Delete a week's whole report (cascades). Editors for unlocked weeks; admin for locked. */
export async function deleteWeek(formData: FormData): Promise<void> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) return;

  const report = await findReport(property, week);
  if (!report) return;
  if (isLockedStatus(report.status) && !isAdmin(user)) return;

  await prisma.weeklyReport.delete({ where: { id: report.id } });
  await logAudit("weekly_delete", `${property} ${week}`, { status: report.status });
  revalidatePath("/weekly", "layout");
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
