import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";

import { buildNarrativeContext } from "@/lib/ai/context";
import { NARRATIVE_MODEL, systemPromptFor } from "@/lib/ai/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI narrative generation (Phase 13). Builds a compact, pre-formatted JSON
 * context from the database for the requested section, then streams a grounded
 * draft back as plain text. The Anthropic API key stays server-side.
 */
export async function POST(req: NextRequest) {
  let section: string;
  let property: string;
  let period: string;
  try {
    const body = (await req.json()) as { section?: string; property?: string; period?: string };
    section = body.section ?? "";
    property = body.property ?? "";
    period = body.period ?? "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!section || !property || !period) {
    return Response.json({ error: "section, property and period are required." }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "AI generation is not configured — set ANTHROPIC_API_KEY on the server to enable drafts." },
      { status: 501 },
    );
  }

  const ctx = await buildNarrativeContext(section, property, period);
  if (!ctx) {
    return Response.json({ error: `Unknown property "${property}".` }, { status: 404 });
  }

  const client = new Anthropic({ apiKey });
  const userContent =
    `Report period: ${ctx.period}\n` +
    `Property: ${ctx.property.name} (${ctx.property.code}), ${ctx.property.area}\n` +
    `Restaurant: ${ctx.property.restaurantName} · Spa: ${ctx.property.spaName}\n\n` +
    `Context JSON — the only figures you may cite:\n${JSON.stringify(ctx.data, null, 2)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const messageStream = client.messages.stream({
          model: NARRATIVE_MODEL,
          max_tokens: 1500,
          temperature: 0.2,
          system: systemPromptFor(section),
          messages: [{ role: "user", content: userContent }],
        });
        messageStream.on("text", (text) => controller.enqueue(encoder.encode(text)));
        await messageStream.finalMessage();
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(encoder.encode(`\n[Generation failed: ${message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
