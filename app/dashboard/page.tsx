import { redirect } from "next/navigation";

import { getShellData } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function DashboardIndexPage() {
  const { defaultPath } = await getShellData();
  redirect(defaultPath);
}
