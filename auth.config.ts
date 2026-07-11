import type { NextAuthConfig } from "next-auth";
import type { UserRole } from "@prisma/client";

/**
 * Edge-safe auth config (Phase 16). No providers with server-only imports and no
 * adapter here — this half is used by the middleware to read the JWT session.
 * The full config (Credentials + Google + Prisma adapter) lives in auth.ts.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
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
