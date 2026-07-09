import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SectionCard } from "@/components/dashboard/section-card";
import { GROUP_CODE, getRoomsSummary } from "@/lib/dashboard-data";
import { formatNumber, formatPercent } from "@/lib/format";
import { periodLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function NationalityGeographyPage({
  params,
  searchParams,
}: {
  params: { property: string; period: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Nationality & Geography" description="Consolidated view coming soon." />;
  }
  const scope = searchParams.scope === "ytd" ? "YTD" : "MTD";
  const rooms = await getRoomsSummary(params.property, params.period, scope);
  if (!rooms || !rooms.period) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook to populate nationality data."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const total = rooms.nationalities.reduce((s, n) => s + n.roomNights, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <SectionCard
        title="Nationality & Geography"
        description={`Room nights by guest nationality — ${scope}`}
        insight="Geographic region roll-ups will appear here once region data is imported."
      >
        {rooms.nationalities.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">#</th>
                  <th className="py-2 pr-4 font-medium">Nationality</th>
                  <th className="py-2 pr-4 text-right font-medium">Room Nights</th>
                  <th className="py-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {rooms.nationalities.map((n) => (
                  <tr key={n.countryName} className="border-b border-border/60">
                    <td className="py-2 pr-4 text-muted-foreground">{n.rank}</td>
                    <td className="py-2 pr-4 text-foreground">{n.countryName}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                      {formatNumber(n.roomNights)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {total > 0 ? formatPercent((n.roomNights / total) * 100) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No nationality breakdown for {rooms.property.code} this period.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
