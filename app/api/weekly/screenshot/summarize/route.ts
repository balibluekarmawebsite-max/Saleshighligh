import { readFile } from "node:fs/promises";

import type { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { storagePath } from "@/lib/storage";
import { groqChatStream, isGroqConfigured, type GroqImage } from "@/lib/weekly/groq";
import { screenshotCategoryLabel } from "@/lib/weekly/screenshots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MEDIA: Record<string, GroqImage["mediaType"]> = {
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
 * AI vision summary for a weekly SM screenshot. Reads the stored image, asks
 * Groq (vision) to summarise it, and streams the text back. EDITOR/ADMIN only.
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

  if (!isGroqConfigured()) {
    return Response.json({ error: "AI is not configured — set GROQ_API_KEY on the server." }, { status: 501 });
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await groqChatStream(
          {
            system: SYSTEM,
            user: `This screenshot is categorised as "${screenshotCategoryLabel(shot.category)}". Summarise it for the weekly report.`,
            image: { data, mediaType },
            maxTokens: 600,
            temperature: 0.2,
          },
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
