/**
 * S3-compatible object storage util (Phase 16) targeting Supabase Storage's REST
 * API — no SDK dependency. Used for uploaded images (promotions, plans). Returns
 * a public URL, or null when storage isn't configured (local/dev fallback).
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET (default
 * "uploads"). The bucket must be public (or front it with signed URLs).
 */

export function isStorageConfigured(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

const bucket = () => process.env.SUPABASE_STORAGE_BUCKET ?? "uploads";

/** Upload bytes to `key` and return the public URL (or null if not configured). */
export async function uploadObject(key: string, data: Buffer | Uint8Array, contentType: string): Promise<string | null> {
  const base = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !serviceKey) return null;

  const res = await fetch(`${base}/storage/v1/object/${bucket()}/${key}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body: new Uint8Array(data),
  });
  if (!res.ok) {
    throw new Error(`Storage upload failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
  return publicUrl(key);
}

export function publicUrl(key: string): string {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket()}/${key}`;
}
