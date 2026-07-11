import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";

/**
 * Full auth config (Phase 16, Node runtime). Credentials (email + bcrypt) and
 * Google SSO, backed by the Prisma adapter. The API key / secrets are read from
 * env; providers self-disable when their env vars are absent.
 */
const providers: NonNullable<NextAuthConfig["providers"]> = [
  Credentials({
    name: "Email",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
    async authorize(credentials) {
      const email = typeof credentials?.email === "string" ? credentials.email.toLowerCase().trim() : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      if (!email || !password) return null;
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) return null;
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return null;
      return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role, assignedProperties: user.assignedProperties };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, allowDangerousEmailAccountLinking: true }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers,
});
