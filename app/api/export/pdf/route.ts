import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { periodToDate } from "@/lib/dashboard-data";
import { pdfRenderOrigin, renderPrintPdf } from "@/lib/export/pdf-render";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/export/pdf?property=BKDS&period=2026-06 — prints the dedicated
 * /print/[property]/[period] route to a paginated PDF via Playwright/Chromium.
 * Requires a Node host with Chromium available (not serverless/edge).
 */
export async function GET(req: NextRequest) {
  if (!rateLimit(req, "export", 10, 60_000)) return tooManyRequests();
  const guard = await requireRole(["ADMIN", "EDITOR", "VIEWER"]);
  if ("response" in guard) return guard.response;
  const url = new URL(req.url);
  const property = url.searchParams.get("property");
  const period = url.searchParams.get("period");
  if (!property || !period) {
    return Response.json({ error: "property and period are required." }, { status: 400 });
  }

  const sections = url.searchParams.get("sections");
  const printParams = new URLSearchParams();
  if (sections) printParams.set("sections", sections);
  if (process.env.AUTH_SECRET) printParams.set("token", process.env.AUTH_SECRET);
  const qs = printParams.toString();
  const printUrl = `${pdfRenderOrigin()}/print/${property}/${period}${qs ? `?${qs}` : ""}`;

  const result = await renderPrintPdf(printUrl);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  try {
    const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
    if (prop) {
      await prisma.exportHistory.create({
        data: { propertyId: prop.id, period: periodToDate(period), format: "pdf", scope: "single" },
      });
    }
    await logAudit("export.pdf", `${property} ${period}`);
  } catch {
    /* ignore audit failures */
  }

  return new Response(result.pdf, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${property}-${period}-sales-highlight.pdf"`,
      "cache-control": "no-store",
    },
  });
}
