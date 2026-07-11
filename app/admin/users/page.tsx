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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Users &amp; Roles</h2>
        <p className="mt-1 text-sm text-muted-foreground">ADMIN full access · EDITOR imports &amp; edits assigned properties · VIEWER read-only + export.</p>
      </div>
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
