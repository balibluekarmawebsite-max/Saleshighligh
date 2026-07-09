import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Stub AI narrative endpoint. Phase 13 wires this to a real model; for now it
 * returns a canned draft so the "Generate with AI" button has a working shape.
 */
export async function POST(req: NextRequest) {
  let section = "SUMMARY";
  try {
    const body = (await req.json()) as { section?: string };
    if (body.section) section = body.section;
  } catch {
    // ignore — use default
  }

  const text =
    `[Draft — AI generation lands in Phase 13]\n` +
    `This is a placeholder ${section.toLowerCase().replace(/_/g, " ")} draft. ` +
    `Once wired up, this will summarise the period's performance vs budget, ` +
    `key drivers, and recommended actions based on the imported data.`;

  return Response.json({ text, stub: true });
}
