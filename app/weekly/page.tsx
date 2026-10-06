import { redirect } from "next/navigation";

import { getWeeklyShellData } from "@/lib/weekly/dashboard-data";

export const dynamic = "force-dynamic";

/** Weekly Reports landing — go to the latest week that has data. */
export default async function WeeklyIndexPage() {
  const { defaultPath } = await getWeeklyShellData();
  redirect(defaultPath);
}
