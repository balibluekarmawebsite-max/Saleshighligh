import { notFound } from "next/navigation";

import { AccountsParetoChart } from "@/components/charts/accounts-pareto-chart";
import { RevenueMixChart } from "@/components/charts/revenue-mix-chart";
import { SegmentRevenueBarChart } from "@/components/charts/segment-revenue-bar-chart";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { SectionCard } from "@/components/dashboard/section-card";
import { AccountProductionTable } from "@/components/tables/account-production-table";
import { SegmentPerformanceTable } from "@/components/tables/segment-performance-table";
import { GROUP_CODE, getSegmentsPageData } from "@/lib/dashboard-data";
import { formatIDR } from "@/lib/format";
import { periodLabel, shortSegment } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function SegmentsPage({
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
  const data = await getSegmentsPageData(params.property, params.period, scope);
  if (!data) notFound();

  if (!data.hasData) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook to populate market-segment and account data."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  // Insight chips (computed, no AI).
  const totalRN = data.totals.actual.rn;
  const topSeg = [...data.segments].sort((a, b) => b.actual.rn - a.actual.rn)[0];
  const gapSeg = [...data.segments].sort(
    (a, b) => a.actual.revenue - a.budget.revenue - (b.actual.revenue - b.budget.revenue),
  )[0];
  const chips: string[] = [];
  if (topSeg && totalRN > 0) {
    chips.push(`Top segment: ${topSeg.name} (${((topSeg.actual.rn / totalRN) * 100).toFixed(0)}% of RN)`);
  }
  if (gapSeg) {
    const gap = gapSeg.actual.revenue - gapSeg.budget.revenue;
    chips.push(`Biggest gap vs budget: ${gapSeg.name} (${gap < 0 ? "−" : "+"}${formatIDR(Math.abs(gap))})`);
  }

  const revenueChart = data.segments.map((s) => ({
    segment: shortSegment(s.name),
    actual: s.actual.revenue,
    budget: s.budget.revenue,
    lastYear: s.lastYear ? s.lastYear.revenue : null,
  }));
  const rnMix = data.segments
    .filter((s) => s.actual.rn > 0)
    .map((s) => ({ label: shortSegment(s.name), value: s.actual.rn }));

  // Pareto: top 10 accounts by revenue with cumulative %.
  let running = 0;
  const pareto = data.accounts.slice(0, 10).map((a) => {
    running += a.pctOfRevenue;
    return { name: a.accountName, pct: a.pctOfRevenue, cumulative: running };
  });

  const fileBase = `${data.property.code}-${params.period}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {data.property.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Market Segment &amp; Account Production · {periodLabel(params.period)} ·{" "}
          <span className="font-medium text-foreground">{scope}</span>
        </p>
      </div>

      {/* Market Segment Performance */}
      <ExportableCard
        title="Market Segment Performance"
        description={`This Year vs Budget vs Last Year — ${scope}`}
        fileName={`${fileBase}-segment-performance`}
      >
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {chips.map((c) => (
              <span key={c} className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
                {c}
              </span>
            ))}
          </div>
        )}
        {data.segments.length > 0 ? (
          <SegmentPerformanceTable segments={data.segments} totals={data.totals} />
        ) : (
          <p className="text-sm text-muted-foreground">No {scope} segment data for this period.</p>
        )}
      </ExportableCard>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExportableCard
          title="Revenue by Segment"
          description="Actual vs Budget vs Last Year"
          fileName={`${fileBase}-segment-revenue`}
        >
          {revenueChart.length > 0 ? (
            <SegmentRevenueBarChart data={revenueChart} />
          ) : (
            <p className="text-sm text-muted-foreground">No data.</p>
          )}
        </ExportableCard>

        <ExportableCard
          title="Room Nights Mix"
          description="Share of room nights by segment (Actual)"
          fileName={`${fileBase}-rn-mix`}
        >
          {rnMix.length > 0 ? (
            <RevenueMixChart data={rnMix} valueFormat="number" />
          ) : (
            <p className="text-sm text-muted-foreground">No room-night data.</p>
          )}
        </ExportableCard>
      </div>

      {/* Account Production */}
      <ExportableCard
        title="Top 10 Accounts — Pareto"
        description="Share of revenue and cumulative % (YTD)"
        fileName={`${fileBase}-accounts-pareto`}
      >
        {pareto.length > 0 ? (
          <AccountsParetoChart data={pareto} />
        ) : (
          <p className="text-sm text-muted-foreground">No account data.</p>
        )}
      </ExportableCard>

      <SectionCard title="Account Production (YTD)" description="Sortable, filterable by account type">
        {data.accounts.length > 0 ? (
          <AccountProductionTable accounts={data.accounts} />
        ) : (
          <p className="text-sm text-muted-foreground">No account production for this period.</p>
        )}
      </SectionCard>
    </div>
  );
}
