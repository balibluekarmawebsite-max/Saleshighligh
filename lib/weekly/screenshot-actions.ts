"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { deleteObject, uploadObject } from "@/lib/storage";
import { isLockedStatus } from "@/lib/weekly/editor-data";
import {
  SCREENSHOT_CATEGORIES,
  SCREENSHOT_MAX_BYTES,
  SCREENSHOT_MIME,
} from "@/lib/weekly/screenshots";

export interface ScreenshotResult {
  ok: boolean;
  message?: string;
  id?: string;
}

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const isCategory = (v: string) => SCREENSHOT_CATEGORIES.some((c) => c.id === v);

async function findReport(propertyCode: string, week: string) {
  return prisma.weeklyReport.findFirst({
    where: { property: { code: propertyCode }, endDate: new Date(`${week}T00:00:00.000Z`) },
    select: { id: true, status: true },
  });
}

/** Resolve a screenshot's edit context: its property, week, lock state and image key. */
async function loadContext(id: string) {
  const row = await prisma.weeklyScreenshot.findUnique({
    where: { id },
    select: {
      imageKey: true,
      reportWeek: {
        select: { status: true, endDate: true, property: { select: { code: true } } },
      },
    },
  });
  if (!row) return null;
  return {
    imageKey: row.imageKey,
    status: row.reportWeek.status,
    property: row.reportWeek.property.code,
    week: row.reportWeek.endDate.toISOString().slice(0, 10),
  };
}

/** Upload one screenshot image for a week and create its row. (FormData action.) */
export async function uploadWeeklyScreenshot(formData: FormData): Promise<ScreenshotResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const week = String(formData.get("week") ?? "");
  const categoryRaw = String(formData.get("category") ?? "other");
  const category = isCategory(categoryRaw) ? categoryRaw : "other";
  const blockKey = String(formData.get("blockKey") ?? "").trim() || null;
  const title = String(formData.get("title") ?? "").trim() || null;
  const file = formData.get("file");

  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have edit access to ${property}.` };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Attach a PNG, JPG or WebP image." };
  }
  if (!SCREENSHOT_MIME.includes(file.type)) {
    return { ok: false, message: "Unsupported file type — use PNG, JPG or WebP." };
  }
  if (file.size > SCREENSHOT_MAX_BYTES) {
    return { ok: false, message: "Image is too large (max 8 MB)." };
  }

  const report = await findReport(property, week);
  if (!report) return { ok: false, message: "Report not found — create this week first." };
  if (isLockedStatus(report.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to edit." };
  }

  const ext = EXT[file.type] ?? "png";
  const key = `weekly/${property}/${week}/${randomUUID()}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());
  const url = await uploadObject(key, buf);
  if (!url) return { ok: false, message: "Could not store the image." };

  const count = await prisma.weeklyScreenshot.count({ where: { reportWeekId: report.id } });
  const row = await prisma.weeklyScreenshot.create({
    data: {
      reportWeekId: report.id,
      category,
      blockKey,
      title,
      imageUrl: url,
      imageKey: key,
      sortOrder: count,
    },
    select: { id: true },
  });

  await logAudit("weekly_screenshot_upload", `${property} ${week}`, { category });
  revalidatePath(`/weekly/${property}/${week}/editor`);
  revalidatePath(`/weekly/${property}/${week}/dashboard`);
  return { ok: true, id: row.id };
}

/** Update a screenshot's title / summary / category. */
export async function saveWeeklyScreenshot(input: {
  id: string;
  title: string;
  summary: string;
  category: string;
  aiGenerated: boolean;
}): Promise<ScreenshotResult> {
  const ctx = await loadContext(input.id);
  if (!ctx) return { ok: false, message: "Screenshot not found." };
  const user = await getCurrentUser();
  if (!canEditProperty(user, ctx.property)) {
    return { ok: false, message: `You don't have edit access to ${ctx.property}.` };
  }
  if (isLockedStatus(ctx.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to edit." };
  }

  await prisma.weeklyScreenshot.update({
    where: { id: input.id },
    data: {
      title: input.title.trim() || null,
      summary: input.summary.trim() || null,
      category: isCategory(input.category) ? input.category : "other",
      aiGenerated: input.aiGenerated,
    },
  });

  await logAudit("weekly_screenshot_save", `${ctx.property} ${ctx.week}`, { id: input.id, ai: input.aiGenerated });
  revalidatePath(`/weekly/${ctx.property}/${ctx.week}/editor`);
  revalidatePath(`/weekly/${ctx.property}/${ctx.week}/dashboard`);
  return { ok: true };
}

/** Delete a screenshot (row + stored file). */
export async function deleteWeeklyScreenshot(id: string): Promise<ScreenshotResult> {
  const ctx = await loadContext(id);
  if (!ctx) return { ok: false, message: "Screenshot not found." };
  const user = await getCurrentUser();
  if (!canEditProperty(user, ctx.property)) {
    return { ok: false, message: `You don't have edit access to ${ctx.property}.` };
  }
  if (isLockedStatus(ctx.status)) {
    return { ok: false, message: "This report is approved/locked — reopen it to edit." };
  }

  await prisma.weeklyScreenshot.delete({ where: { id } });
  try {
    await deleteObject(ctx.imageKey);
  } catch {
    /* file already gone — ignore */
  }

  await logAudit("weekly_screenshot_delete", `${ctx.property} ${ctx.week}`, { id });
  revalidatePath(`/weekly/${ctx.property}/${ctx.week}/editor`);
  revalidatePath(`/weekly/${ctx.property}/${ctx.week}/dashboard`);
  return { ok: true };
}
