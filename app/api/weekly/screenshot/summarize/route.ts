import { readFile } from "node:fs/promises";

import Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { storagePath } from "@/lib/storage";
import { NARRATIVE_MODEL } from "@/lib/weekly/ai-prompts";
import { screenshotCategoryLabel } from "@/lib/weekly/screenshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA: Record<string, "image/png" | "image/jpeg" | "image/webp"> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const SYSTEM = `You summarise a single screenshot taken from a social-media or OTA analytics dashboard (e.g. Booking.com, Instagram, Facebook, Google Business) for an internal WEEKLY Sales & Marketing report for Blue Karma Group, a Bali hospitality company.

Rules:
- Describe only what is actually visible in the image. Quote figures and percentage changes exactly as they appear; never invent, estimate or round a number that is not shown.
- Lead with the headline metrics and their week-over-week (or period) changes, then any notable detail.
- Professional, British-neutral hospitality English. 2–4 sentences, plain prose — no markdown, no bullet symbols, no emoji.
- If a value is not legible, say so rather than guessing.`;

/**
 * AI vision summary for a weekly SM screenshot (Phase 10). Reads the stored
 * image, asks Claude (vision) to summarise it, and streams the text back.
 * EDITOR/ADMIN only; the API key stays server-side.
 */
export async function POST(req: NextRequest) {
  let id: string;
  try {
    const body = (await req.json()) as { id?: string };
    id = body.id ?? "";
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!id) return Response.json({ error: "id is required." }, { status: 400 });

  if (!rateLimit(req, "weekly-screenshot", 20, 60_000)) return tooManyRequests();
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
          "AI generation is not configured — set ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN), or run `ant auth login` and set ANTHROPIC_USE_PROFILE=true, on the server.",
      },
      { status: 501 },
    );
  }

  const shot = await prisma.weeklyScreenshot.findUnique({
    where: { id },
    select: { imageKey: true, category: true },
  });
  if (!shot) return Response.json({ error: "Screenshot not found." }, { status: 404 });

  const ext = shot.imageKey.split(".").pop()?.toLowerCase() ?? "png";
  const mediaType = MEDIA[ext] ?? "image/png";
  let data: string;
  try {
    data = (await readFile(storagePath(shot.imageKey))).toString("base64");
  } catch {
    return Response.json({ error: "The image file could not be read on the server." }, { status: 500 });
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
          max_tokens: 600,
          temperature: 0.2,
          system: SYSTEM,
          messages: [
            {
              role: "user",
              content: [
                { type: "image", source: { type: "base64", media_type: mediaType, data } },
                {
                  type: "text",
                  text: `This screenshot is categorised as "${screenshotCategoryLabel(shot.category)}". Summarise it for the weekly report.`,
                },
              ],
            },
          ],
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
