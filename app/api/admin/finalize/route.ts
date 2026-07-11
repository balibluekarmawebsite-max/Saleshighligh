import type { NextRequest } from "next/server";
import type { ReportStatus } from "@prisma/client";

import { requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { periodToDate } from "@/lib/dashboard-data";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST { property, period, status: "FINAL" | "DRAFT" } — ADMIN marks a period final / re-opens it. */
export async function POST(req: NextRequest) {
  const guard = await requireRole(["ADMIN"]);
  if ("response" in guard) return guard.response;

  let property: string;
  let period: string;
  let status: string;
  try {
    const body = (await req.json()) as { property?: string; period?: string; status?: string };
    property = body.property ?? "";
    period = body.period ?? "";
    status = body.status ?? "FINAL";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!property || !/^\d{4}-\d{2}$/.test(period) || (status !== "FINAL" && status !== "DRAFT")) {
    return Response.json({ error: "property, period and a valid status are required." }, { status: 400 });
  }

  const rp = await prisma.reportPeriod.findFirst({
    where: { property: { code: property }, period: periodToDate(period) },
    select: { id: true },
  });
  if (!rp) return Response.json({ error: "No report period found." }, { status: 404 });

  await prisma.reportPeriod.update({ where: { id: rp.id }, data: { status: status as ReportStatus } });
  await logAudit(status === "FINAL" ? "period.final" : "period.reopen", `${property} ${period}`);

  return Response.json({ ok: true, status });
}
