import type { NextRequest } from "next/server";
import type { UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

import { requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLES: UserRole[] = ["ADMIN", "EDITOR", "VIEWER"];

/** GET — list users (ADMIN). */
export async function GET() {
  const guard = await requireRole(["ADMIN"]);
  if ("response" in guard) return guard.response;
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, role: true, assignedProperties: true, createdAt: true },
  });
  return Response.json({ users });
}

/** POST — create a user with an email + password (ADMIN). */
export async function POST(req: NextRequest) {
  const guard = await requireRole(["ADMIN"]);
  if ("response" in guard) return guard.response;

  const body = (await req.json().catch(() => ({}))) as { email?: string; name?: string; password?: string; role?: string; assignedProperties?: string[] };
  const email = (body.email ?? "").toLowerCase().trim();
  const password = body.password ?? "";
  const role = (ROLES.includes(body.role as UserRole) ? body.role : "VIEWER") as UserRole;
  const assignedProperties = Array.isArray(body.assignedProperties) ? body.assignedProperties.map((s) => String(s).toUpperCase()) : [];
  if (!email || password.length < 8) {
    return Response.json({ error: "A valid email and a password of at least 8 characters are required." }, { status: 400 });
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return Response.json({ error: "A user with that email already exists." }, { status: 409 });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { email, name: body.name ?? null, passwordHash, role, assignedProperties },
    select: { id: true, email: true, role: true },
  });
  await logAudit("user.create", email, { role, assignedProperties });
  return Response.json({ ok: true, user });
}

/** PATCH — update a user's role / assigned properties, or reset password (ADMIN). */
export async function PATCH(req: NextRequest) {
  const guard = await requireRole(["ADMIN"]);
  if ("response" in guard) return guard.response;

  const body = (await req.json().catch(() => ({}))) as { id?: string; role?: string; assignedProperties?: string[]; password?: string };
  if (!body.id) return Response.json({ error: "id is required." }, { status: 400 });

  const data: { role?: UserRole; assignedProperties?: string[]; passwordHash?: string } = {};
  if (body.role && ROLES.includes(body.role as UserRole)) data.role = body.role as UserRole;
  if (Array.isArray(body.assignedProperties)) data.assignedProperties = body.assignedProperties.map((s) => String(s).toUpperCase());
  if (typeof body.password === "string" && body.password.length >= 8) data.passwordHash = await bcrypt.hash(body.password, 10);

  const user = await prisma.user.update({ where: { id: body.id }, data, select: { id: true, email: true, role: true, assignedProperties: true } });
  await logAudit("user.update", user.email ?? user.id, { role: user.role, assignedProperties: user.assignedProperties });
  return Response.json({ ok: true, user });
}
