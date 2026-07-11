import { Suspense } from "react";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { ContextBar } from "@/components/layout/context-bar";
import { getCurrentUser } from "@/lib/auth-helpers";
import { GROUP_CODE, getShellData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { property: string; period: string };
}) {
  const shell = await getShellData();
  const me = process.env.AUTH_SECRET ? await getCurrentUser() : null;
  const validProperty =
    params.property === GROUP_CODE ||
    shell.properties.some((p) => p.code === params.property);
  if (!validProperty || !/^\d{4}-\d{2}$/.test(params.period)) {
    notFound();
  }

  return (
    <AppShell
      property={params.property}
      period={params.period}
      userEmail={me?.email ?? null}
      header={
        <Suspense fallback={<div className="h-16 border-b border-border bg-white" />}>
          <ContextBar
            properties={shell.properties}
            periodsByProperty={shell.periodsByProperty}
            property={params.property}
            period={params.period}
          />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
