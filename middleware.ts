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
  // Protect everything except Next internals, the login page, the auth API, and
  // the /print route (self-gated by session-or-internal-token so the PDF
  // exporter's headless-browser fetch can reach it).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|print|api/auth).*)"],
};
