import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SectionCard } from "@/components/dashboard/section-card";
import { GROUP_CODE, getRoomsSummary } from "@/lib/dashboard-data";
import { formatNumber, formatPercent } from "@/lib/format";
import { periodLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function LengthOfStayPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Length of Stay" description="Consolidated view coming soon." />;
  }
  const rooms = await getRoomsSummary(params.property, params.period);
  if (!rooms || !rooms.period) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook to populate length-of-stay data."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const total = rooms.lengthOfStay.reduce((s, l) => s + l.roomNights, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <SectionCard title="Length of Stay" description="Bookings and room nights by nights stayed">
        {rooms.lengthOfStay.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Nights</th>
                  <th className="py-2 pr-4 text-right font-medium">Bookings</th>
                  <th className="py-2 pr-4 text-right font-medium">Room Nights</th>
                  <th className="py-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {rooms.lengthOfStay.map((l) => (
                  <tr key={l.losBucket} className="border-b border-border/60">
                    <td className="py-2 pr-4 text-foreground">{l.losBucket}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                      {formatNumber(l.bookings)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                      {formatNumber(l.roomNights)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {total > 0 ? formatPercent((l.roomNights / total) * 100) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No length-of-stay data for {rooms.property.code} this period.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
