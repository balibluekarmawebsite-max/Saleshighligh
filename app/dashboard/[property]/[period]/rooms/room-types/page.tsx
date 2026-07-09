import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SectionCard } from "@/components/dashboard/section-card";
import { variancePct } from "@/lib/calculations";
import { GROUP_CODE, getRoomsSummary } from "@/lib/dashboard-data";
import {
  formatIDR,
  formatNumber,
  formatVariancePercent,
  varianceColorClass,
} from "@/lib/format";
import { periodLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RoomTypesPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Room Types" description="Consolidated view coming soon." />;
  }
  const rooms = await getRoomsSummary(params.property, params.period);
  if (!rooms || !rooms.period) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook to populate room-type data."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <SectionCard title="Room Type Production" description="Actual vs budget by room type">
        {rooms.roomTypes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Room Type</th>
                  <th className="py-2 pr-4 text-right font-medium">Room Nights (A/B)</th>
                  <th className="py-2 pr-4 text-right font-medium">ADR</th>
                  <th className="py-2 pr-4 text-right font-medium">Revenue</th>
                  <th className="py-2 text-right font-medium">Var %</th>
                </tr>
              </thead>
              <tbody>
                {rooms.roomTypes.map((r) => {
                  const v = variancePct(r.revenueActual, r.revenueBudget);
                  return (
                    <tr key={r.roomTypeName} className="border-b border-border/60">
                      <td className="py-2 pr-4 text-foreground">{r.roomTypeName}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                        {formatNumber(r.roomNightsActual)}
                        <span className="text-muted-foreground"> / {formatNumber(r.roomNightsBudget)}</span>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatIDR(r.adrActual)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatIDR(r.revenueActual)}</td>
                      <td className={cn("py-2 text-right tabular-nums", varianceColorClass(v))}>
                        {formatVariancePercent(v)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No room-type breakdown for {rooms.property.code} this period.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
