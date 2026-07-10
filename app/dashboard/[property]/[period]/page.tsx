import { redirect } from "next/navigation";

import { GroupView } from "@/components/group/group-view";
import { GROUP_CODE } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default function PeriodIndex({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <GroupView period={params.period} />;
  }
  redirect(`/dashboard/${params.property}/${params.period}/summary`);
}
