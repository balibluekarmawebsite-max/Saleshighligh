import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The week root redirects to its Dashboard. */
export default function WeeklyBasePage({
  params,
}: {
  params: { property: string; week: string };
}) {
  redirect(`/weekly/${params.property}/${params.week}/dashboard`);
}
