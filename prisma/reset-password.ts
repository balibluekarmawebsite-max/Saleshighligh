/**
 * Reset an existing user's password by email (recovery helper).
 *   RESET_EMAIL=user@x.com RESET_PASSWORD='new-strong-pass' npm run db:reset-password
 *
 * Keeps the user's role and property access unchanged — it only sets a new
 * password. To (re)create the first ADMIN when you're locked out, use
 * `npm run db:create-admin` instead (that one also forces the ADMIN role).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.RESET_EMAIL?.toLowerCase().trim();
  const password = process.env.RESET_PASSWORD;
  if (!email || !password || password.length < 8) {
    console.error("Set RESET_EMAIL and RESET_PASSWORD (>= 8 chars).");
    process.exit(1);
  }
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!existing) {
    console.error(
      `No user with email "${email}". Create them in /admin/users first, or use db:create-admin to (re)create an ADMIN.`,
    );
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.update({
    where: { email },
    data: { passwordHash },
    select: { email: true, role: true },
  });
  console.log(`✅ Password reset for ${user.email} (${user.role}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
