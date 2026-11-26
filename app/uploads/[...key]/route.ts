import { readFile } from "node:fs/promises";

import type { NextRequest } from "next/server";

import { storagePath } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serve an uploaded file (images for influencer cards, plans, etc.) straight
 * from the storage directory on disk. This is a reliable fallback for static
 * `public/uploads` serving, which doesn't work in every deployment (standalone
 * builds, a reverse proxy, or a cwd mismatch won't serve files written at
 * runtime). It reads from the SAME UPLOAD_DIR the files are written to, so an
 * uploaded image always resolves. Path traversal is blocked by storagePath's
 * safeKey. Files are public (the auth middleware already excludes /uploads).
 */

const CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

export async function GET(_req: NextRequest, { params }: { params: { key: string[] } }): Promise<Response> {
  const key = (params.key ?? []).join("/");
  if (!key) return new Response("Not found", { status: 404 });

  let abs: string;
  try {
    abs = storagePath(key); // validates the key (rejects traversal)
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  let data: Buffer;
  try {
    data = await readFile(abs);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const ext = (key.split(".").pop() ?? "").toLowerCase();
  const type = CONTENT_TYPE[ext] ?? "application/octet-stream";
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
