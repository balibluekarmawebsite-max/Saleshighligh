import { ActualBudgetBarChart } from "@/components/charts/actual-budget-bar-chart";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { SectionCard } from "@/components/dashboard/section-card";
import { VarianceTable } from "@/components/tables/variance-table";
import { GROUP_CODE, getRoomsSummary } from "@/lib/dashboard-data";
import { periodLabel, shortSegment } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function MarketSegmentPage({
  params,
  searchParams,
}: {
  params: { property: string; period: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Market Segment" description="Consolidated view coming soon." />;
  }
  const scope = searchParams.scope === "ytd" ? "YTD" : "MTD";
  const rooms = await getRoomsSummary(params.property, params.period, scope);

  if (!rooms || !rooms.period) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook to populate market-segment data."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const chart = rooms.segments.map((s) => ({
    label: shortSegment(s.segmentName),
    actual: s.actualRevenue,
    budget: s.budgetRevenue,
  }));

  return (
    <div className="mx-auto max-w-6xl">
      <SectionCard
        title="Market Segment"
        description={`Room revenue by segment, actual vs budget — ${scope}`}
      >
        {rooms.segments.length > 0 ? (
          <>
            <ActualBudgetBarChart data={chart} />
            <VarianceTable
              rows={rooms.segments.map((s) => ({
                label: s.segmentName,
                actual: s.actualRevenue,
                budget: s.budgetRevenue,
              }))}
              firstColumnHeader="Segment"
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No {scope} market-segment data for this period.
          </p>
        )}
      </SectionCard>
    </div>
  );
}
