import { UsersManager } from "@/components/admin/users-manager";
import { getCurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function UsersAdminPage() {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN") {
    return <NotAuthorized />;
  }

  const [users, properties] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, assignedProperties: true } }),
    prisma.property.findMany({ orderBy: { code: "asc" }, select: { code: true } }),
  ]);

  // Without AUTH_SECRET the app runs "open" (synthetic admin) and the /login form
  // is disabled — so users created here can't actually sign in yet. Warn loudly.
  const authEnabled = !!process.env.AUTH_SECRET;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Users &amp; Roles</h2>
        <p className="mt-1 text-sm text-muted-foreground">ADMIN full access · EDITOR imports &amp; edits assigned properties · VIEWER read-only + export.</p>
      </div>
      {!authEnabled && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-medium">Login isn&apos;t enabled yet — these users can&apos;t sign in.</p>
          <p className="mt-1">
            The app is running in open mode (no <code>AUTH_SECRET</code>), so everyone has full access without
            logging in and the sign-in form is disabled. To let these users log in, set <code>AUTH_SECRET</code> and{" "}
            <code>AUTH_URL</code> on the server and restart (see DEPLOY.md). After that, everyone — including you —
            must sign in, so make sure at least one account here has the <strong>ADMIN</strong> role first.
          </p>
        </div>
      )}
      <UsersManager users={users} properties={properties.map((p) => p.code)} />
    </div>
  );
}

function NotAuthorized() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">Admins only</p>
        <p className="mt-1 text-sm text-muted-foreground">You need the ADMIN role to manage users.</p>
      </div>
    </div>
  );
}
