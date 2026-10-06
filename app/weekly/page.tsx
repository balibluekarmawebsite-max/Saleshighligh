import { redirect } from "next/navigation";

import { getShellData } from "@/lib/dashboard-data";
import { currentWeekId } from "@/lib/weekly/week";

export const dynamic = "force-dynamic";

/** Weekly Reports landing — resolve a default property and the current week. */
export default async function WeeklyIndexPage() {
  const shell = await getShellData();
  const property = shell.properties[0]?.code ?? "BKDS";
  redirect(`/weekly/${property}/${currentWeekId()}/dashboard`);
}
