/**
 * Bootstrap the first ADMIN user (Phase 16).
 *   ADMIN_EMAIL=you@bluekarma.com ADMIN_PASSWORD='strong-pass' npm run db:create-admin
 * Re-running updates the password and ensures the ADMIN role.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? "Administrator";
  if (!email || !password || password.length < 8) {
    console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD (>= 8 chars).");
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN" },
    create: { email, name, passwordHash, role: "ADMIN" },
    select: { email: true, role: true },
  });
  console.log(`✅ Admin ready: ${user.email} (${user.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
