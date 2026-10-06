import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { WeeklyContextBar } from "@/components/layout/weekly-context-bar";
import { getCurrentUser } from "@/lib/auth-helpers";
import { getShellData } from "@/lib/dashboard-data";
import { isWeekId } from "@/lib/weekly/week";

export const dynamic = "force-dynamic";

export default async function WeeklyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { property: string; week: string };
}) {
  const shell = await getShellData();
  const me = process.env.AUTH_SECRET ? await getCurrentUser() : null;
  const validProperty = shell.properties.some((p) => p.code === params.property);
  if (!validProperty || !isWeekId(params.week)) {
    notFound();
  }

  return (
    <AppShell
      property={params.property}
      period={params.week}
      userEmail={me?.email ?? null}
      header={
        <WeeklyContextBar
          properties={shell.properties}
          property={params.property}
          week={params.week}
        />
      }
    >
      {children}
    </AppShell>
  );
}
