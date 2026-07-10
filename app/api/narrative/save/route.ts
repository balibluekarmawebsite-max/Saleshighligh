import type { NextRequest } from "next/server";
import type { NarrativeSection } from "@prisma/client";

import { periodToDate } from "@/lib/dashboard-data";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_SECTIONS: NarrativeSection[] = [
  "SUMMARY",
  "EXTERNAL_FACTORS",
  "INTERNAL_FACTORS",
  "ROOMTYPE_ANALYSIS",
  "RESTAURANT_OVERVIEW",
  "SPA_OVERVIEW",
  "MARKET_INTEL",
  "SALES_STRATEGY",
  "ACTION_PLAN",
  "MARKETING_PLAN",
  "SOCIAL_PLAN",
  "CONSORTIA",
  "MAGAZINE",
  "PR",
  "PROMOTIONS",
];

/**
 * Persist a narrative section (Phase 13). Upserts the live `NarrativeContent`
 * row and appends an immutable `NarrativeVersion` for history. FINAL periods are
 * locked. Admin auth gating lands with the auth phase.
 */
export async function POST(req: NextRequest) {
  let section: string;
  let property: string;
  let period: string;
  let content: string;
  let aiGenerated: boolean;
  try {
    const body = (await req.json()) as {
      section?: string;
      property?: string;
      period?: string;
      content?: string;
      aiGenerated?: boolean;
    };
    section = body.section ?? "";
    property = body.property ?? "";
    period = body.period ?? "";
    content = body.content ?? "";
    aiGenerated = Boolean(body.aiGenerated);
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!property || !period || !content.trim()) {
    return Response.json({ error: "property, period and content are required." }, { status: 400 });
  }
  if (!VALID_SECTIONS.includes(section as NarrativeSection)) {
    return Response.json({ error: `Unknown section "${section}".` }, { status: 400 });
  }
  const sec = section as NarrativeSection;

  const reportPeriod = await prisma.reportPeriod.findFirst({
    where: { property: { code: property }, period: periodToDate(period) },
    select: { id: true, status: true },
  });
  if (!reportPeriod) {
    return Response.json({ error: "No report period found for this property/period." }, { status: 404 });
  }
  if (reportPeriod.status === "FINAL") {
    return Response.json({ error: "This period is FINAL and locked for edits." }, { status: 409 });
  }

  const source = aiGenerated ? "ai" : "human";

  await prisma.$transaction([
    prisma.narrativeContent.upsert({
      where: { periodId_section: { periodId: reportPeriod.id, section: sec } },
      create: { periodId: reportPeriod.id, section: sec, content, aiGenerated },
      update: { content, aiGenerated },
    }),
    prisma.narrativeVersion.create({
      data: { periodId: reportPeriod.id, section: sec, content, aiGenerated, source },
    }),
  ]);

  return Response.json({ ok: true });
}
