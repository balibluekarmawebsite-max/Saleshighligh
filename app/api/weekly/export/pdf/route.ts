import type { NextRequest } from "next/server";
import type { Browser } from "playwright";

import { requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
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
  const printUrl = `${url.origin}/print/weekly/${property}/${week}${qs ? `?${qs}` : ""}`;

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
    const firstMsg = err instanceof Error ? err.message : "unknown error";
    const execPath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
    if (!execPath) {
      console.error("[weekly/export/pdf] chromium.launch failed:", firstMsg);
      return Response.json(
        {
          error: `Could not launch Chromium for PDF export: ${firstMsg}. Install the browser (npx playwright install chromium) or set PLAYWRIGHT_CHROMIUM_PATH.`,
        },
        { status: 500 },
      );
    }
    // Fallback to the configured binary — wrap it too so a bad path / missing
    // system libraries surface a clear message instead of a generic failure.
    try {
      browser = await chromium.launch({ headless: true, executablePath: execPath, args: ["--no-sandbox"] });
    } catch (err2) {
      const secondMsg = err2 instanceof Error ? err2.message : "unknown error";
      console.error("[weekly/export/pdf] chromium.launch(executablePath) failed:", secondMsg);
      return Response.json(
        {
          error: `Could not launch Chromium at PLAYWRIGHT_CHROMIUM_PATH (${execPath}): ${secondMsg}. If it mentions a missing library, install Chromium's system dependencies: npx playwright install-deps chromium`,
        },
        { status: 500 },
      );
    }
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
          data: { propertyId: prop.id, period: new Date(`${week}T00:00:00.000Z`), format: "pdf", scope: "weekly" },
        });
      }
      await logAudit("weekly_export.pdf", `${property} ${week}`, { sections: sections ?? "all" });
    } catch {
      /* ignore audit failures */
    }

    return new Response(new Uint8Array(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${property}-${week}-weekly-report.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    // Rendering (navigation / pdf) failed — surface the real reason, don't 500 blankly.
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[weekly/export/pdf] render failed:", msg);
    return Response.json({ error: `PDF render failed: ${msg}` }, { status: 500 });
  } finally {
    await browser.close();
  }
}
