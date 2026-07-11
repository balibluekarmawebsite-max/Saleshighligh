/**
 * Minimal in-memory rate limiter (Phase 16). A fixed-window counter keyed by
 * client IP + bucket. Good enough as a basic guard on a single instance; for
 * multi-instance / serverless production, back this with Upstash Redis (see
 * DEPLOY.md) — the interface stays the same.
 */

interface Window {
  count: number;
  resetAt: number;
}

const store = new Map<string, Window>();

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Returns true if the request is allowed. `limit` requests are permitted per
 * `windowMs` per IP+bucket.
 */
export function rateLimit(req: Request, bucket: string, limit = 30, windowMs = 60_000): boolean {
  const key = `${bucket}:${clientIp(req)}`;
  const now = Date.now();
  const win = store.get(key);
  if (!win || now > win.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (win.count >= limit) return false;
  win.count += 1;
  return true;
}

export function tooManyRequests(): Response {
  return Response.json({ error: "Too many requests — slow down and try again shortly." }, { status: 429 });
}
