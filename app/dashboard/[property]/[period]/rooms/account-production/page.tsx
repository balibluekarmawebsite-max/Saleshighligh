import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SectionCard } from "@/components/dashboard/section-card";
import { GROUP_CODE, getRoomsSummary } from "@/lib/dashboard-data";
import { formatIDR, formatNumber } from "@/lib/format";
import { ACCOUNT_TYPE_LABELS, periodLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AccountProductionPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Account Production" description="Consolidated view coming soon." />;
  }
  const rooms = await getRoomsSummary(params.property, params.period);
  if (!rooms || !rooms.period) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook to populate account-production data."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <SectionCard title="Top Account Production" description="Room nights and revenue by account (YTD)">
        {rooms.accounts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Account</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 text-right font-medium">Room Nights</th>
                  <th className="py-2 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rooms.accounts.map((a) => (
                  <tr key={a.accountName} className="border-b border-border/60">
                    <td className="py-2 pr-4 text-foreground">{a.accountName}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {ACCOUNT_TYPE_LABELS[a.accountType] ?? a.accountType}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                      {formatNumber(a.roomNights)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-foreground">
                      {formatIDR(a.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No account production for {rooms.property.code} this period.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
