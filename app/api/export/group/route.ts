import type { NextRequest } from "next/server";
import JSZip from "jszip";

import { requireRole } from "@/lib/auth-helpers";
import { logAudit } from "@/lib/audit";
import { periodToDate } from "@/lib/dashboard-data";
import { DEFAULT_SECTION_IDS, buildDeck } from "@/lib/export/pptx";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/export/group?period=2026-06 — a zip of every property's Sales
 * Highlight deck. The consolidated Group summary deck lands with Phase 15.
 */
export async function GET(req: NextRequest) {
  if (!rateLimit(req, "export", 10, 60_000)) return tooManyRequests();
  const guard = await requireRole(["ADMIN", "EDITOR", "VIEWER"]);
  if ("response" in guard) return guard.response;
  const url = new URL(req.url);
  const period = url.searchParams.get("period");
  if (!period) {
    return Response.json({ error: "period is required." }, { status: 400 });
  }

  const properties = await prisma.property.findMany({ select: { code: true }, orderBy: { code: "asc" } });
  if (properties.length === 0) {
    return Response.json({ error: "No properties found." }, { status: 404 });
  }

  const zip = new JSZip();
  let added = 0;
  for (const p of properties) {
    const deck = await buildDeck(p.code, period, DEFAULT_SECTION_IDS);
    if (deck) {
      zip.file(deck.fileName, deck.buffer);
      added += 1;
    }
  }
  zip.file(
    "README.txt",
    `Group pack — Blue Karma Sales Highlight (${period}).\n\n` +
      `Contains one Sales Highlight deck per property (${added} included).\n` +
      `The consolidated Group summary deck lands with Phase 15.\n`,
  );

  const content = (await zip.generateAsync({ type: "nodebuffer" })) as Buffer;

  try {
    await prisma.exportHistory.create({
      data: { period: periodToDate(period), format: "group-zip", scope: "group", sections: DEFAULT_SECTION_IDS },
    });
    await logAudit("export.group", period, { properties: added });
  } catch {
    /* ignore audit failures */
  }

  return new Response(new Uint8Array(content), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="blue-karma-${period}-group-pack.zip"`,
      "cache-control": "no-store",
    },
  });
}
