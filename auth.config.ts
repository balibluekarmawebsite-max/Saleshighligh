import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@prisma/client";

/**
 * Edge-safe auth config (Phase 16). No providers with server-only imports and no
 * adapter here — this half is used by the middleware to read the JWT session.
 * The full config (Credentials + Google + Prisma adapter) lives in auth.ts.
 */

/**
 * Behind a TLS-terminating proxy (Cloudflare → Apache → `next start` on HTTP),
 * the Node server sees each request as HTTP. Left to auto-detect, Auth.js can
 * then choose the secure-cookie prefix differently in the login handler (Node
 * runtime) and the middleware (edge runtime) — the session cookie gets written
 * under one name (e.g. `__Secure-authjs.session-token`) and read under another
 * (`authjs.session-token`), so a fresh, correct login bounces straight back to
 * `/login?callbackUrl=…`. Deriving it ONCE from the public URL (always HTTPS in
 * production) keeps both halves consistent. Local dev over http:// stays
 * non-secure so login still works there.
 */
const useSecureCookies = /^https:\/\//i.test(
  process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "",
);

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  useSecureCookies,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      // On sign-in `user` is present (from authorize/adapter) — copy role + access.
      if (user) {
        token.id = user.id;
        if (user.role) token.role = user.role;
        token.assignedProperties = user.assignedProperties ?? [];
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string | undefined) ?? session.user.id;
        session.user.role = (token.role as UserRole | undefined) ?? "VIEWER";
        session.user.assignedProperties = (token.assignedProperties as string[] | undefined) ?? [];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
