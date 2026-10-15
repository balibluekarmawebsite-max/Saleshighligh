import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Route protection (Phase 16). Enforced only when AUTH_SECRET is set, so the app
 * stays open in dev / preview until auth is configured, and locks down in
 * production once the secret + provider env vars are present.
 */
export default auth((req) => {
  if (!process.env.AUTH_SECRET) return; // auth disabled → open
  if (req.auth) return; // signed in
  const { pathname, search } = req.nextUrl;
  // Diagnostic (names only, no values): on a bounce, show which cookies the
  // request carried and the forwarded protocol — so a "correct password but
  // still bounced" case tells us whether the session cookie is MISSING (not
  // set / wrong name / not sent) or PRESENT-but-unreadable (secret/salt), and
  // whether Apache is forwarding https. Safe to leave on; silence with
  // AUTH_DEBUG=0.
  if (process.env.AUTH_DEBUG !== "0") {
    const names = req.cookies.getAll().map((c) => c.name).join(", ") || "(none)";
    console.log(
      `[auth][mw] no session → /login (from ${pathname}); x-forwarded-proto=${req.headers.get("x-forwarded-proto") ?? "?"}; cookies=[${names}]`,
    );
  }
  const callbackUrl = encodeURIComponent(pathname + search);
  const res = NextResponse.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, req.nextUrl));
  // The login bounce must NEVER be cached. Otherwise a CDN/proxy (Cloudflare)
  // can store the logged-out redirect and keep replaying it for `/` even after
  // a valid session cookie is set — the app's middleware then never runs again
  // and the user is stuck on /login despite a correct login.
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  res.headers.set("CDN-Cache-Control", "no-store");
  return res;
});

export const config = {
  // Protect everything except Next internals, the login page, the auth API, the
  // cron API (self-gated by CRON_SECRET so the scheduler's token request isn't
  // redirected to /login), the data-push + jobs APIs (/api/import, /api/jobs,
  // self-gated by IMPORT_API_TOKEN / VHP_JOBS_TOKEN so the VHP scraper's token
  // requests aren't redirected to /login), the /print route (self-gated so the
  // PDF exporter's headless-browser fetch can reach it), and /uploads (static
  // user images, served by unguessable key — the PDF exporter loads them as
  // <img> sub-resources without a session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|print|uploads|api/auth|api/cron|api/import|api/jobs).*)"],
};
