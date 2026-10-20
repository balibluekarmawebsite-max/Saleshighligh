import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** The month root redirects to its default section (Occupancy Pick-Up). */
export default function DailyIndex({ params }: { params: { property: string; month: string } }) {
  redirect(`/daily/${params.property}/${params.month}/pickup`);
}
