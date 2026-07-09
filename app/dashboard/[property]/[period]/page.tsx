import { notFound } from "next/navigation";

import { ActualBudgetBarChart } from "@/components/charts/actual-budget-bar-chart";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SectionCard } from "@/components/dashboard/section-card";
import { VarianceTable } from "@/components/tables/variance-table";
import { variancePct } from "@/lib/calculations";
import {
  GROUP_CODE,
  getExecutiveSummary,
  getProperties,
  type MetricAB,
} from "@/lib/dashboard-data";
import { formatIDR, formatRatioPct } from "@/lib/format";
import { periodLabel, shortSegment } from "@/lib/labels";

export const dynamic = "force-dynamic";

function currencyKpi(label: string, m: MetricAB | null) {
  return (
    <KpiCard
      label={label}
      value={m ? formatIDR(m.actual) : "—"}
      budgetValue={m ? formatIDR(m.budget) : undefined}
      deltaPct={m ? variancePct(m.actual, m.budget) : null}
    />
  );
}

export default async function ExecutiveSummaryPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return (
      <ComingSoon
        title="Group — Executive Summary"
        description="Consolidated view across BKDS, BKDU and BKV is coming in a later phase."
      />
    );
  }

  const properties = await getProperties();
  if (!properties.some((p) => p.code === params.property)) notFound();

  const summary = await getExecutiveSummary(params.property, params.period);

  if (!summary || !summary.period) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="This report period hasn't been imported yet. Upload the monthly workbook to populate it."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const departmentChart = summary.departments.map((d) => ({
    label: d.label,
    actual: d.actual,
    budget: d.budget,
  }));

  const segmentChart = summary.segments.map((s) => ({
    label: shortSegment(s.segmentName),
    actual: s.actualRevenue,
    budget: s.budgetRevenue,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {summary.property.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {summary.property.area} · {summary.property.roomCount} rooms ·{" "}
          <span className="font-medium text-foreground">
            {periodLabel(params.period)}
          </span>
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Occupancy"
          value={summary.occupancy ? formatRatioPct(summary.occupancy.actual) : "—"}
          budgetValue={summary.occupancy ? formatRatioPct(summary.occupancy.budget) : undefined}
          deltaPct={summary.occupancy ? variancePct(summary.occupancy.actual, summary.occupancy.budget) : null}
        />
        {currencyKpi("ADR", summary.adr)}
        {currencyKpi("RevPAR", summary.revpar)}
        {currencyKpi("Total Revenue", summary.totalRevenue)}
      </section>

      <SectionCard
        title="Revenue by Department"
        description={`Actual vs budget — ${periodLabel(params.period)}`}
      >
        {departmentChart.length > 0 && <ActualBudgetBarChart data={departmentChart} />}
        <VarianceTable
          rows={summary.departments.map((d) => ({ label: d.label, actual: d.actual, budget: d.budget }))}
          firstColumnHeader="Department"
          total={
            summary.totalRevenue
              ? { label: "Total Revenue", actual: summary.totalRevenue.actual, budget: summary.totalRevenue.budget }
              : undefined
          }
        />
      </SectionCard>

      <SectionCard
        title="Rooms — Market Segment"
        description="Room revenue by segment, actual vs budget (MTD)"
      >
        {segmentChart.length > 0 ? (
          <>
            <ActualBudgetBarChart data={segmentChart} />
            <VarianceTable
              rows={summary.segments.map((s) => ({ label: s.segmentName, actual: s.actualRevenue, budget: s.budgetRevenue }))}
              firstColumnHeader="Segment"
            />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No market-segment data for this period.</p>
        )}
      </SectionCard>
    </div>
  );
}
