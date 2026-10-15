/**
 * Read-only login diagnostic — tells us exactly why a sign-in is refused,
 * instead of guessing from the browser. Checks the stored user(s), whether a
 * password hash is set, whether YOUR password actually matches it, duplicate
 * rows differing only by email case, and the auth env vars. Writes nothing.
 *
 *   cd /home/bkdash/Saleshighligh
 *   EMAIL=socialmedia@bluekarmasecrets.com PASSWORD='the-password-you-type' npm run db:diagnose-login
 *
 * Paste the whole output back. (The password is only used locally for a bcrypt
 * compare; it is never stored or sent anywhere.)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.EMAIL ?? "").toLowerCase().trim();
  const password = process.env.PASSWORD ?? "";
  if (!email) {
    console.error("Set EMAIL=... (and optionally PASSWORD='...').");
    process.exit(1);
  }

  console.log("── Auth environment ───────────────────────────");
  console.log("AUTH_SECRET set:", !!process.env.AUTH_SECRET);
  console.log("AUTH_URL       :", process.env.AUTH_URL ?? "(unset)");
  console.log("NEXTAUTH_URL   :", process.env.NEXTAUTH_URL ?? "(unset)");
  console.log("Google SSO     :", !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET));

  const total = await prisma.user.count();
  console.log("\n── Users ──────────────────────────────────────");
  console.log("Total users in DB:", total);

  // Anything that looks like this account (same local-part), any casing.
  const localPart = email.split("@")[0] ?? email;
  const candidates = await prisma.user.findMany({
    where: { email: { contains: localPart, mode: "insensitive" } },
    select: { id: true, email: true, name: true, role: true, passwordHash: true, assignedProperties: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  if (candidates.length === 0) {
    console.log(`\n⚠️  No user whose email contains "${localPart}". The account does not exist — create it in /admin/users.`);
  }
  for (const u of candidates) {
    const same = u.email?.toLowerCase().trim() === email;
    console.log(
      `\n  • email="${u.email}" ${same ? "(exact match)" : "(DIFFERENT casing/spacing!)"}` +
        `\n    role=${u.role}  hasPasswordHash=${!!u.passwordHash}  assigned=[${u.assignedProperties.join(", ")}]` +
        `\n    created=${u.createdAt.toISOString()}  id=${u.id}`,
    );
  }

  // The exact row NextAuth's authorize() will use (case-insensitive match).
  const match = await prisma.user.findFirst({ where: { email: { equals: email, mode: "insensitive" } } });
  console.log("\n── Sign-in simulation (what authorize() does) ──");
  if (!match) {
    console.log(`❌ authorize() would find NO user for "${email}" → CredentialsSignin.`);
  } else if (!match.passwordHash) {
    console.log(`❌ User "${match.email}" has NO passwordHash (created without a password) → CredentialsSignin. Reset it.`);
  } else if (!password) {
    console.log(`ℹ️  User "${match.email}" found with a password hash. Re-run with PASSWORD='...' to test the exact password.`);
  } else {
    const ok = await bcrypt.compare(password, match.passwordHash);
    console.log(`User "${match.email}" — bcrypt.compare(your password) = ${ok ? "✅ MATCH" : "❌ NO MATCH"}`);
    console.log(
      ok
        ? "   → The password is correct. If login still fails, it is the SESSION COOKIE, not credentials."
        : "   → The password does NOT match the stored hash. Reset it (db:reset-password) and type it manually.",
    );
    if (!ok) console.log(`   (you passed a password of length ${password.length}; leading/trailing spaces count)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
