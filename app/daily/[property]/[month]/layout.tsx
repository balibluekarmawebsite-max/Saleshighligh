import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { DailyContextBar } from "@/components/layout/daily-context-bar";
import { getDailyShellData, isMonthId } from "@/lib/daily/pickup-report-data";
import { getCurrentUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export default async function DailyLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { property: string; month: string };
}) {
  const shell = await getDailyShellData();
  const me = process.env.AUTH_SECRET ? await getCurrentUser() : null;
  const validProperty = shell.properties.some((p) => p.code === params.property);
  if (!validProperty || !isMonthId(params.month)) {
    notFound();
  }

  return (
    <AppShell
      property={params.property}
      period={params.month}
      userEmail={me?.email ?? null}
      header={
        <DailyContextBar
          properties={shell.properties}
          months={shell.monthsByProperty[params.property] ?? []}
          property={params.property}
          month={params.month}
        />
      }
    >
      {children}
    </AppShell>
  );
}
