import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth-helpers";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { buildWeeklyContext } from "@/lib/weekly/ai-context";
import { weeklySystemPromptFor } from "@/lib/weekly/ai-prompts";
import { groqChatStream, isGroqConfigured } from "@/lib/weekly/groq";
import { isWeekId } from "@/lib/weekly/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AI drafting for the weekly Section A overview blocks. Builds a compact,
 * pre-formatted JSON context for the week, then streams a grounded draft of
 * one block back as plain text. Groq-backed; EDITOR/ADMIN only.
 */
export async function POST(req: NextRequest) {
  let property: string;
  let week: string;
  let block: string;
  try {
    const body = (await req.json()) as { property?: string; week?: string; block?: string };
    property = (body.property ?? "").toUpperCase();
    week = body.week ?? "";
    block = body.block ?? "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!property || !week || !block) {
    return Response.json({ error: "property, week and block are required." }, { status: 400 });
  }
  if (!isWeekId(week)) {
    return Response.json({ error: "week must be a yyyy-mm-dd week id." }, { status: 400 });
  }

  if (!rateLimit(req, "weekly-narrative", 20, 60_000)) return tooManyRequests();
  const guard = await requireRole(["ADMIN", "EDITOR"]);
  if ("response" in guard) return guard.response;

  if (!isGroqConfigured()) {
    return Response.json(
      { error: "AI is not configured — set GROQ_API_KEY on the server." },
      { status: 501 },
    );
  }

  const ctx = await buildWeeklyContext(property, week, block);
  if (!ctx) return Response.json({ error: `Unknown property "${property}".` }, { status: 404 });

  const userContent =
    `Weekly report: ${ctx.week}\n` +
    `Property: ${ctx.property.name} (${ctx.property.code}), ${ctx.property.area}\n` +
    (ctx.headlineMonthLabel ? `Reporting month: ${ctx.headlineMonthLabel}\n` : "") +
    `\nContext JSON — the only figures you may cite:\n${JSON.stringify(ctx.data, null, 2)}`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await groqChatStream(
          { system: weeklySystemPromptFor(block), user: userContent, maxTokens: 900, temperature: 0.2 },
          (text) => controller.enqueue(encoder.encode(text)),
        );
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
