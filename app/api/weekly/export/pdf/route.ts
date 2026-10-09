import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { pdfRenderOrigin, renderPrintPdf } from "@/lib/export/pdf-render";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { isWeekId } from "@/lib/weekly/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/weekly/export/pdf?property=BKDS&week=2026-10-01 — prints the
 * dedicated /print/weekly/[property]/[week] route to a paginated A4-landscape
 * PDF via Playwright/Chromium. Requires a Node host with Chromium available.
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

  const sections = url.searchParams.get("sections");
  const printParams = new URLSearchParams();
  if (sections) printParams.set("sections", sections);
  if (process.env.AUTH_SECRET) printParams.set("token", process.env.AUTH_SECRET);
  const qs = printParams.toString();
  const printUrl = `${pdfRenderOrigin()}/print/weekly/${property}/${week}${qs ? `?${qs}` : ""}`;

  const result = await renderPrintPdf(printUrl);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  try {
    const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
    if (prop) {
      await prisma.exportHistory.create({
        data: { propertyId: prop.id, period: new Date(`${week}T00:00:00.000Z`), format: "pdf", scope: "weekly" },
      });
    }
    await logAudit("weekly_export.pdf", `${property} ${week}`, { sections: sections ?? "all" });
  } catch {
    /* ignore audit failures */
  }

  return new Response(result.pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${property}-${week}-weekly-report.pdf"`,
      "cache-control": "no-store",
    },
  });
}
