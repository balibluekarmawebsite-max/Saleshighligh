import type { NextRequest } from "next/server";
import type { Browser } from "playwright";

import { periodToDate } from "@/lib/dashboard-data";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/export/pdf?property=BKDS&period=2026-06 — prints the dedicated
 * /print/[property]/[period] route to a paginated PDF via Playwright/Chromium.
 * Requires a Node host with Chromium available (not serverless/edge).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const property = url.searchParams.get("property");
  const period = url.searchParams.get("period");
  if (!property || !period) {
    return Response.json({ error: "property and period are required." }, { status: 400 });
  }

  const sections = url.searchParams.get("sections");
  const printUrl = `${url.origin}/print/${property}/${period}${sections ? `?sections=${encodeURIComponent(sections)}` : ""}`;

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return Response.json({ error: "PDF export requires the 'playwright' package on the server." }, { status: 501 });
  }

  let browser: Browser;
  try {
    browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  } catch (err) {
    const execPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    if (!execPath) {
      const message = err instanceof Error ? err.message : "unknown error";
      return Response.json(
        { error: `Could not launch Chromium for PDF export: ${message}. Install the browser (npx playwright install chromium) or set PLAYWRIGHT_CHROMIUM_PATH.` },
        { status: 500 },
      );
    }
    browser = await chromium.launch({ headless: true, executablePath: execPath, args: ["--no-sandbox"] });
  }

  try {
    const page = await browser.newPage();
    await page.goto(printUrl, { waitUntil: "networkidle", timeout: 60_000 });
    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "12mm", bottom: "12mm", left: "12mm", right: "12mm" },
    });

    try {
      const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
      if (prop) {
        await prisma.exportHistory.create({
          data: { propertyId: prop.id, period: periodToDate(period), format: "pdf", scope: "single" },
        });
      }
    } catch {
      /* ignore audit failures */
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${property}-${period}-sales-highlight.pdf"`,
        "cache-control": "no-store",
      },
    });
  } finally {
    await browser.close();
  }
}
