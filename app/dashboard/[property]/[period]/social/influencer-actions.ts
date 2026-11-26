"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { logAudit } from "@/lib/audit";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { deleteObject, uploadObject } from "@/lib/storage";

export interface InfluencerActionResult {
  ok: boolean;
  message?: string;
  id?: string;
}

const IMG_MIME = ["image/png", "image/jpeg", "image/webp"];
const IMG_MAX_BYTES = 8 * 1024 * 1024;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const PERIOD_RE = /^\d{4}-\d{2}$/;

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

/** Parse a follower count that may be plain ("10600"), with separators, or
 *  compact ("10.6K", "106K", "1.2M"). Returns a whole number, 0 on nonsense. */
function parseFollowers(raw: string): number {
  const t = raw.trim().replace(/,/g, "");
  if (!t) return 0;
  const m = t.match(/^([\d.]+)\s*([kKmMbB]?)$/);
  if (m) {
    const base = Number(m[1]);
    const suf = (m[2] ?? "").toLowerCase();
    const mult = suf === "k" ? 1_000 : suf === "m" ? 1_000_000 : suf === "b" ? 1_000_000_000 : 1;
    return Number.isFinite(base) ? Math.round(base * mult) : 0;
  }
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Normalise a handle to a single @handle token (or ""). */
function cleanHandle(raw: string): string {
  const t = raw.trim().replace(/^@+/, "").replace(/\s+/g, "");
  return t ? `@${t}` : "";
}

/** Resolve an existing entry's edit context (property + lock state + image key). */
async function loadContext(id: string) {
  const row = await prisma.influencerCollab.findUnique({
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
 * Editor/admin: add one influencer collaboration — a screenshot + its details
 * (name, @handle, followers, origin) and a short summary. FormData action so the
 * image streams as a File. Creates (and, if needed, opens a DRAFT period). A
 * FINAL period is refused.
 */
export async function addInfluencerCollab(formData: FormData): Promise<InfluencerActionResult> {
  const property = String(formData.get("property") ?? "").toUpperCase();
  const periodStr = String(formData.get("period") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const handle = cleanHandle(String(formData.get("handle") ?? ""));
  const followers = parseFollowers(String(formData.get("followers") ?? ""));
  const origin = String(formData.get("origin") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const file = formData.get("file");

  const user = await getCurrentUser();
  if (!canEditProperty(user, property)) {
    return { ok: false, message: `You don't have edit access to ${property}.` };
  }
  const date = periodDate(periodStr);
  if (!date) return { ok: false, message: "Invalid period." };
  if (!name && !handle) return { ok: false, message: "Enter at least a name or an @handle." };
  if (!handle) return { ok: false, message: "An @handle is required (it identifies the collaboration)." };

  // Validate the image up front (optional — an entry may be text-only).
  let uploaded: { url: string; key: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (!IMG_MIME.includes(file.type)) return { ok: false, message: "Unsupported image — use PNG, JPG or WebP." };
    if (file.size > IMG_MAX_BYTES) return { ok: false, message: "Image is too large (max 8 MB)." };
  }

  const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
  if (!prop) return { ok: false, message: "Unknown property." };

  const existingPeriod = await prisma.reportPeriod.findUnique({
    where: { propertyId_period: { propertyId: prop.id, period: date } },
    select: { id: true, status: true },
  });
  if (existingPeriod?.status === "FINAL") {
    return { ok: false, message: "This report period is FINAL and locked — reopen it to edit." };
  }
  const periodId =
    existingPeriod?.id ??
    (await prisma.reportPeriod.create({ data: { propertyId: prop.id, period: date, status: "DRAFT" }, select: { id: true } })).id;

  // Reject a duplicate handle before writing the image, so we don't orphan a file.
  const dup = await prisma.influencerCollab.findUnique({
    where: { periodId_handle: { periodId, handle } },
    select: { id: true },
  });
  if (dup) return { ok: false, message: `${handle} is already in this month's collaborations.` };

  if (file instanceof File && file.size > 0) {
    const ext = EXT[file.type] ?? "png";
    const key = `social/influencer/${property}/${periodStr}/${randomUUID()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const url = await uploadObject(key, buf);
    if (!url) return { ok: false, message: "Could not store the image." };
    uploaded = { url, key };
  }

  const count = await prisma.influencerCollab.count({ where: { periodId } });
  let row: { id: string };
  try {
    row = await prisma.influencerCollab.create({
      data: {
        periodId,
        handle,
        name: name || handle,
        followers,
        origin: origin || "—",
        notes: notes || null,
        imageUrl: uploaded?.url ?? null,
        imageKey: uploaded?.key ?? null,
        sortOrder: count,
      },
      select: { id: true },
    });
  } catch (e) {
    if (uploaded) await deleteObject(uploaded.key).catch(() => {});
    return { ok: false, message: e instanceof Error ? e.message : "Could not add the collaboration." };
  }

  await logAudit("social_influencer_add", `${property} ${periodStr}`, { handle });
  revalidatePath(`/dashboard/${property}/${periodStr}/social`);
  return { ok: true, id: row.id };
}

/** Editor/admin: edit an existing collaboration's details + summary. */
export async function updateInfluencerCollab(input: {
  id: string;
  name: string;
  handle: string;
  followers: string;
  origin: string;
  notes: string;
}): Promise<InfluencerActionResult> {
  const ctx = await loadContext(input.id);
  if (!ctx) return { ok: false, message: "Collaboration not found." };
  const user = await getCurrentUser();
  if (!canEditProperty(user, ctx.property)) {
    return { ok: false, message: `You don't have edit access to ${ctx.property}.` };
  }
  if (ctx.status === "FINAL") return { ok: false, message: "This report period is FINAL and locked." };

  const handle = cleanHandle(input.handle);
  if (!handle) return { ok: false, message: "An @handle is required." };

  try {
    await prisma.influencerCollab.update({
      where: { id: input.id },
      data: {
        handle,
        name: input.name.trim() || handle,
        followers: parseFollowers(input.followers),
        origin: input.origin.trim() || "—",
        notes: input.notes.trim() || null,
      },
    });
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save." };
  }

  await logAudit("social_influencer_update", `${ctx.property} ${ctx.period}`, { id: input.id, handle });
  revalidatePath(`/dashboard/${ctx.property}/${ctx.period}/social`);
  return { ok: true };
}

/** Editor/admin: delete a collaboration (row + stored image). */
export async function deleteInfluencerCollab(id: string): Promise<InfluencerActionResult> {
  const ctx = await loadContext(id);
  if (!ctx) return { ok: false, message: "Collaboration not found." };
  const user = await getCurrentUser();
  if (!canEditProperty(user, ctx.property)) {
    return { ok: false, message: `You don't have edit access to ${ctx.property}.` };
  }
  if (ctx.status === "FINAL") return { ok: false, message: "This report period is FINAL and locked." };

  await prisma.influencerCollab.delete({ where: { id } });
  if (ctx.imageKey) await deleteObject(ctx.imageKey).catch(() => {});

  await logAudit("social_influencer_delete", `${ctx.property} ${ctx.period}`, { id });
  revalidatePath(`/dashboard/${ctx.property}/${ctx.period}/social`);
  return { ok: true };
}
