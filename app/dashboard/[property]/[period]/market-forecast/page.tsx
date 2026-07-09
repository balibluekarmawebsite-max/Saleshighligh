import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function MarketForecastRedirect({
  params,
}: {
  params: { property: string; period: string };
}) {
  redirect(`/dashboard/${params.property}/${params.period}/market`);
}
