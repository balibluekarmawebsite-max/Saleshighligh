import { redirect } from "next/navigation";

import { getDailyShellData } from "@/lib/daily/pickup-report-data";

export const dynamic = "force-dynamic";

/** Land on the first property's most recent snapshot month (or the current month). */
export default async function DailyLanding() {
  const shell = await getDailyShellData();
  const first = shell.properties[0];
  if (!first) redirect("/dashboard");

  const months = shell.monthsByProperty[first.code] ?? [];
  const month = months[0]?.month ?? new Date().toISOString().slice(0, 7);
  redirect(`/daily/${first.code}/${month}/pickup`);
}
