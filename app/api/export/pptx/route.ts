import type { NextRequest } from "next/server";

import { periodToDate } from "@/lib/dashboard-data";
import { DECK_SECTIONS, DEFAULT_SECTION_IDS, buildDeck, type DeckSectionId } from "@/lib/export/pptx";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID = new Set<string>(DECK_SECTIONS.map((s) => s.id));

/** GET /api/export/pptx?property=BKDS&period=2026-06&sections=summary,rooms,… */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const property = url.searchParams.get("property");
  const period = url.searchParams.get("period");
  if (!property || !period) {
    return Response.json({ error: "property and period are required." }, { status: 400 });
  }

  const sectionsParam = url.searchParams.get("sections");
  const sections: DeckSectionId[] = sectionsParam
    ? (sectionsParam.split(",").filter((s) => VALID.has(s)) as DeckSectionId[])
    : DEFAULT_SECTION_IDS;

  const deck = await buildDeck(property, period, sections);
  if (!deck) {
    return Response.json({ error: `Unknown property "${property}".` }, { status: 404 });
  }

  // Best-effort audit row — never blocks the download.
  try {
    const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
    if (prop) {
      await prisma.exportHistory.create({
        data: { propertyId: prop.id, period: periodToDate(period), format: "pptx", scope: "single", sections },
      });
    }
  } catch {
    /* ignore audit failures */
  }

  return new Response(new Uint8Array(deck.buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${deck.fileName}"`,
      "cache-control": "no-store",
    },
  });
}
