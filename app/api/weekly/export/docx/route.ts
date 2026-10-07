import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { buildWeeklyDocx } from "@/lib/weekly/export/docx";
import { getWeeklyExportData } from "@/lib/weekly/export-data";
import { isWeekId } from "@/lib/weekly/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/weekly/export/docx?property=BKDS&week=2026-10-01 — a native Word
 * (.docx) of the week's report: Section A narrative + the tabular sections.
 */
export async function GET(req: NextRequest) {
  if (!rateLimit(req, "weekly-export", 10, 60_000)) return tooManyRequests();
  const guard = await requireRole(["ADMIN", "EDITOR", "VIEWER"]);
  if ("response" in guard) return guard.response;

  const url = new URL(req.url);
  const property = url.searchParams.get("property");
  const week = url.searchParams.get("week");
  if (!property || !week) {
    return Response.json({ error: "property and week are required." }, { status: 400 });
  }
  if (!isWeekId(week)) {
    return Response.json({ error: "week must be a yyyy-mm-dd week id." }, { status: 400 });
  }

  const data = await getWeeklyExportData(property, week);
  if (!data) return Response.json({ error: "Report not found for this week." }, { status: 404 });

  const sectionsParam = url.searchParams.get("sections");
  const sel = sectionsParam ? new Set(sectionsParam.split(",")) : null;

  const buf = await buildWeeklyDocx(data, sel);

  try {
    const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
    if (prop) {
      await prisma.exportHistory.create({
        data: { propertyId: prop.id, period: new Date(`${week}T00:00:00.000Z`), format: "docx", scope: "weekly" },
      });
    }
    await logAudit("weekly_export.docx", `${property} ${week}`, { sections: sectionsParam ?? "all" });
  } catch {
    /* ignore audit failures */
  }

  return new Response(new Uint8Array(buf), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${property}-${week}-weekly-report.docx"`,
      "cache-control": "no-store",
    },
  });
}
