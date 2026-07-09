import { AdminHeader } from "@/components/layout/admin-header";
import { AppShell } from "@/components/layout/app-shell";
import { getShellData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shell = await getShellData();
  const parts = shell.defaultPath.split("/").filter(Boolean);
  const onDashboard = parts[0] === "dashboard";
  const property = onDashboard ? parts[1]! : (shell.properties[0]?.code ?? "BKDS");
  const period = onDashboard ? parts[2]! : "2026-06";

  return (
    <AppShell
      property={property}
      period={period}
      header={<AdminHeader backHref={shell.defaultPath} />}
    >
      {children}
    </AppShell>
  );
}
