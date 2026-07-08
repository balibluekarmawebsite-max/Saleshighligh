import { PrismaClient } from "@prisma/client";

/**
 * Prisma client singleton. In development Next.js clears the module cache on
 * every request, which would otherwise open a new connection each time; we
 * stash the client on `globalThis` to reuse it.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
