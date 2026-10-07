/**
 * Local-disk object storage (self-hosted VPS). Writes uploaded images
 * (promotions, plans) to a directory on the server and returns a public URL
 * path that Next.js serves as a static file. No external service required.
 *
 * Env:
 *   UPLOAD_DIR      — directory to write into (absolute, or relative to the
 *                     project root). Defaults to "public/uploads", which
 *                     Next.js serves directly at "/uploads/<key>".
 *   UPLOAD_URL_BASE — public URL prefix the files are served under.
 *                     Defaults to "/uploads".
 *
 * On a single-server VPS this needs no reverse-proxy changes: files land in
 * public/uploads and are served by the Node server. To keep uploads outside the
 * repo tree, point UPLOAD_DIR at a data volume (e.g. /var/lib/bkdash/uploads)
 * and serve that path with Caddy/nginx, setting UPLOAD_URL_BASE to match.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const uploadDir = () =>
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "public", "uploads");

const urlBase = () => process.env.UPLOAD_URL_BASE ?? "/uploads";

/** Local disk is always available, so storage is always "configured". */
export function isStorageConfigured(): boolean {
  return true;
}

/**
 * Normalise a storage key to a safe relative path: forward slashes, no leading
 * slash, no `..` traversal. Throws on anything that would escape UPLOAD_DIR.
 */
function safeKey(key: string): string {
  const normalised = path
    .normalize(key)
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!normalised || normalised === ".." || normalised.startsWith("../")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return normalised;
}

/** Write bytes to `key` on local disk and return the public URL path. */
export async function uploadObject(
  key: string,
  data: Buffer | Uint8Array,
): Promise<string | null> {
  const rel = safeKey(key);
  const dest = path.join(uploadDir(), rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, data);
  return publicUrl(rel);
}

/** The public URL path a stored `key` is served at. */
export function publicUrl(key: string): string {
  return `${urlBase()}/${safeKey(key)}`;
}

/** Delete a stored object (best-effort; ignores a missing file). */
export async function deleteObject(key: string): Promise<void> {
  const dest = path.join(uploadDir(), safeKey(key));
  await rm(dest, { force: true });
}

/** Absolute on-disk path for a stored key (for server-side reads, e.g. AI vision). */
export function storagePath(key: string): string {
  return path.join(uploadDir(), safeKey(key));
}
