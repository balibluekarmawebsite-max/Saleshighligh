"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { logAudit } from "@/lib/audit";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { deleteObject, uploadObject } from "@/lib/storage";

export interface PromoActionResult {
  ok: boolean;
  message?: string;
  id?: string;
}

const IMG_MIME = ["image/png", "image/jpeg", "image/webp"];
const IMG_MAX_BYTES = 8 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const PERIOD_RE = /^\d{4}-\d{2}$/;
const UNITS = ["ROOMS", "RESTAURANT", "SPA", "WELLNESS"];

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

async function loadContext(id: string) {
  const row = await prisma.promotionImage.findUnique({
    where: { id },
    select: {
      imageKey: true,
      period: { select: { status: true, period: true, property: { select: { code: true } } } },
    },
  });
  if (!row) return null;
  return {
    imageKey: row.imageKey,
    status: row.period.status,
    property: row.period.property.code,
    period: row.period.period.toISOString().slice(0, 7),
  };
}

/**
 * Editor/admin: add one ongoing-promotion image for a unit. FormData action so
 * the image streams as a File. The period is find-or-created and the row written
 * in ONE transaction (no orphan period on failure); the uploaded file is cleaned
 * up if the write fails. A FINAL period is refused.
 */
export async function addPromotionImage(formData: FormData): Promise<PromoActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const periodStr = String(formData.get("period") ?? "");
  const unitRaw = String(formData.get("unit") ?? "").toUpperCase();
  const unit = UNITS.includes(unitRaw) ? unitRaw : "";
  const caption = String(formData.get("caption") ?? "").trim();
  const file = formData.get("file");

  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have edit access to ${property}.` };
  }
  const date = periodDate(periodStr);
  if (!date) return { ok: false, message: "Invalid period." };
  if (!unit) return { ok: false, message: "Unknown promotion unit." };
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Attach a PNG, JPG or WebP image." };
  if (!IMG_MIME.includes(file.type)) return { ok: false, message: "Unsupported image — use PNG, JPG or WebP." };
  if (file.size > IMG_MAX_BYTES) return { ok: false, message: "Image is too large (max 8 MB)." };

  const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
  if (!prop) return { ok: false, message: "Unknown property." };

  const existingPeriod = await prisma.reportPeriod.findUnique({
    where: { propertyId_period: { propertyId: prop.id, period: date } },
    select: { id: true, status: true },
  });
  if (existingPeriod?.status === "FINAL") {
    return { ok: false, message: "This report period is FINAL and locked — reopen it to edit." };
  }

  let uploaded: { url: string; key: string } | null = null;
  try {
    const ext = EXT[file.type] ?? "png";
    const key = `plans/promo/${property}/${periodStr}/${unit}/${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const url = await uploadObject(key, buf);
    if (!url) return { ok: false, message: "Could not store the image." };
    uploaded = { url, key };

    const id = await prisma.$transaction(async (tx) => {
      const periodId =
        existingPeriod?.id ??
        (await tx.reportPeriod.create({ data: { propertyId: prop.id, period: date, status: "DRAFT" }, select: { id: true } })).id;
      const count = await tx.promotionImage.count({ where: { periodId, unit } });
      const row = await tx.promotionImage.create({
        data: { periodId, unit, imageUrl: uploaded!.url, imageKey: uploaded!.key, caption: caption || null, sortOrder: count },
        select: { id: true },
      });
      return row.id;
    });

    await logAudit("plans_promo_add", `${property} ${periodStr}`, { unit });
    revalidatePath(`/dashboard/${property}/${periodStr}/plans`);
    return { ok: true, id };
  } catch {
    if (uploaded) await deleteObject(uploaded.key).catch(() => {});
    return { ok: false, message: "Could not add the image — please try again." };
  }
}

/** Editor/admin: edit a promotion image's caption. */
export async function updatePromotionCaption(input: { id: string; caption: string }): Promise<PromoActionResult> {
  const ctx = await loadContext(input.id);
  if (!ctx) return { ok: false, message: "Image not found." };
  const user = await getCurrentUser();
  if (!canEditProperty(user, ctx.property)) {
    return { ok: false, message: `You don't have edit access to ${ctx.property}.` };
  }
  if (ctx.status === "FINAL") return { ok: false, message: "This report period is FINAL and locked." };

  await prisma.promotionImage.update({ where: { id: input.id }, data: { caption: input.caption.trim() || null } });
  await logAudit("plans_promo_caption", `${ctx.property} ${ctx.period}`, { id: input.id });
  revalidatePath(`/dashboard/${ctx.property}/${ctx.period}/plans`);
  return { ok: true };
}

/** Editor/admin: delete a promotion image (row + stored file). */
export async function deletePromotionImage(id: string): Promise<PromoActionResult> {
  const ctx = await loadContext(id);
  if (!ctx) return { ok: false, message: "Image not found." };
  const user = await getCurrentUser();
  if (!canEditProperty(user, ctx.property)) {
    return { ok: false, message: `You don't have edit access to ${ctx.property}.` };
  }
  if (ctx.status === "FINAL") return { ok: false, message: "This report period is FINAL and locked." };

  await prisma.promotionImage.delete({ where: { id } });
  if (ctx.imageKey) await deleteObject(ctx.imageKey).catch(() => {});
  await logAudit("plans_promo_delete", `${ctx.property} ${ctx.period}`, { id });
  revalidatePath(`/dashboard/${ctx.property}/${ctx.period}/plans`);
  return { ok: true };
}
