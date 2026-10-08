import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth-helpers";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { buildWeeklyContext } from "@/lib/weekly/ai-context";
import { NARRATIVE_MODEL } from "@/lib/weekly/ai-prompts";
import { isWeekId } from "@/lib/weekly/week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "rewrite" | "shorten" | "translate_en" | "translate_id" | "anomalies";

const MODES = new Set<string>([
  "rewrite", "shorten", "translate_en", "translate_id", "anomalies",
]);

const TEXT_PROMPTS: Record<Exclude<Mode, "anomalies">, string> = {
  rewrite:
    "You rewrite short internal weekly-report notes. Rewrite the user's text to be clearer, more professional and well structured, in British-neutral hospitality English. Preserve every fact, name, number, date and the meaning exactly — do not add, drop or invent information. Return ONLY the rewritten text: no preamble, no quotation marks, no commentary.",
  shorten:
    "You condense short internal weekly-report notes. Rewrite the user's text to be as concise as possible while keeping every fact, name, number and date. Return ONLY the shortened text: no preamble, no quotation marks, no commentary.",
  translate_en:
    "You translate short internal weekly-report notes into clear, professional English. If the text is already English, lightly improve its clarity while keeping the meaning. Preserve every name, number and date. Return ONLY the translation: no preamble, no quotation marks, no commentary.",
  translate_id:
    "You translate short internal weekly-report notes into clear, professional Indonesian (Bahasa Indonesia). Preserve every name, number and date. Return ONLY the translation: no preamble, no quotation marks, no commentary.",
};

const ANOMALY_PROMPT = `You review the figures of an internal WEEKLY Sales & Marketing report for Blue Karma Group (Bali hospitality). Using ONLY the numbers present in the provided JSON context, flag likely data-entry anomalies or inconsistencies — for example: Actual far below or above Budget, an occupancy outside a sensible 0–100% range, a zero or missing figure where a value is expected, a revenue/room-nights pair that implies an implausible average rate, or a figure that contradicts another. Do not invent numbers, and do not restate figures that look fine. Return a short bullet list (at most 6 bullets), each a concrete observation that quotes the relevant figure. If nothing looks wrong, reply with a single line saying the figures look consistent.`;

/**
 * Inline AI helpers for the weekly editor (rewrite / shorten / translate the
 * text in a field, or review the week's figures for anomalies). Streams the
 * result back as plain text. The Anthropic key stays server-side; EDITOR/ADMIN.
 */
export async function POST(req: NextRequest) {
  let mode: string;
  let text: string;
  let property: string;
  let week: string;
  try {
    const body = (await req.json()) as {
      mode?: string;
      text?: string;
      property?: string;
      week?: string;
    };
    mode = body.mode ?? "";
    text = (body.text ?? "").toString();
    property = (body.property ?? "").toUpperCase();
    week = body.week ?? "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!MODES.has(mode)) {
    return Response.json({ error: "Unknown AI action." }, { status: 400 });
  }
  if (mode === "anomalies") {
    if (!property || !week || !isWeekId(week)) {
      return Response.json({ error: "property and a valid week are required." }, { status: 400 });
    }
  } else if (!text.trim()) {
    return Response.json({ error: "There is no text to transform." }, { status: 400 });
  }

  if (!rateLimit(req, "weekly-ai-text", 30, 60_000)) return tooManyRequests();
  const guard = await requireRole(["ADMIN", "EDITOR"]);
  if ("response" in guard) return guard.response;

  const hasCredential =
    !!process.env.ANTHROPIC_API_KEY ||
    !!process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.ANTHROPIC_USE_PROFILE === "true";
  if (!hasCredential) {
    return Response.json(
      {
        error:
          "AI is not configured — set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN), or run `ant auth login` and set ANTHROPIC_USE_PROFILE=true, on the server.",
      },
      { status: 501 },
    );
  }

  let system: string;
  let userContent: string;
  if (mode === "anomalies") {
    const ctx = await buildWeeklyContext(property, week, "anomalies");
    if (!ctx) return Response.json({ error: `Unknown property "${property}".` }, { status: 404 });
    system = ANOMALY_PROMPT;
    userContent =
      `Weekly report: ${ctx.week}\nProperty: ${ctx.property.name} (${ctx.property.code})\n` +
      `\nContext JSON — the only figures you may cite:\n${JSON.stringify(ctx.data, null, 2)}`;
  } else {
    system = TEXT_PROMPTS[mode as Exclude<Mode, "anomalies">];
    userContent = text;
  }

  let client: Anthropic;
  try {
    client = new Anthropic();
  } catch (err) {
    const message = err instanceof Error ? err.message : "no usable credential";
    return Response.json({ error: `AI credential could not be resolved: ${message}` }, { status: 501 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const messageStream = client.messages.stream({
          model: NARRATIVE_MODEL,
          max_tokens: mode === "anomalies" ? 600 : 700,
          temperature: mode === "anomalies" ? 0.2 : 0.3,
          system,
          messages: [{ role: "user", content: userContent }],
        });
        messageStream.on("text", (t) => controller.enqueue(encoder.encode(t)));
        await messageStream.finalMessage();
      } catch (err) {
        const message = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(encoder.encode(`\n[AI action failed: ${message}]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
