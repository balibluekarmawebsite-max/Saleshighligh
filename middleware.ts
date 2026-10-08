import NextAuth from "next-auth";

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
  const callbackUrl = encodeURIComponent(pathname + search);
  return Response.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, req.nextUrl));
});

export const config = {
  // Protect everything except Next internals, the login page, the auth API, the
  // cron API (self-gated by CRON_SECRET so the scheduler's token request isn't
  // redirected to /login), the /print route (self-gated by session-or-internal-
  // token so the PDF exporter's headless-browser fetch can reach it), and
  // /uploads (static user images, served by unguessable key — the PDF exporter
  // loads them as <img> sub-resources without a session).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|print|uploads|api/auth|api/cron).*)"],
};
