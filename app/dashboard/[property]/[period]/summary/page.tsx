import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { ForecastOccupancyChart } from "@/components/charts/forecast-occupancy-chart";
import { RevenueMixChart } from "@/components/charts/revenue-mix-chart";
import { Accordion } from "@/components/dashboard/accordion";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { NarrativePanel } from "@/components/dashboard/narrative-panel";
import { SectionCard } from "@/components/dashboard/section-card";
import { VarianceTable } from "@/components/tables/variance-table";
import { variancePct } from "@/lib/calculations";
import {
  GROUP_CODE,
  getSummaryPageData,
  type MetricABL,
} from "@/lib/dashboard-data";
import { formatIDR, formatRatioPct } from "@/lib/format";
import { periodLabel, periodMonthShort } from "@/lib/labels";

export const dynamic = "force-dynamic";

const EXTERNAL_FACTORS = [
  "Market Demand",
  "Supply & Competition",
  "Force Majeure",
  "Safety & Perception",
  "Seasonal & Weather",
  "Additional Factors",
];

function CurrencyKpi({ label, m }: { label: string; m: MetricABL | null }) {
  return (
    <KpiCard
      label={label}
      value={m ? formatIDR(m.actual) : "—"}
      budgetValue={m ? formatIDR(m.budget) : undefined}
      deltaPct={m ? variancePct(m.actual, m.budget) : null}
      lastYearDeltaPct={
        m && m.lastYear !== null ? variancePct(m.actual, m.lastYear) : null
      }
    />
  );
}

export default async function SummaryPage({
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

  const data = await getSummaryPageData(params.property, params.period);
  if (!data) notFound();

  if (!data.hasData) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="This report period hasn't been imported yet. Upload the monthly workbook to populate it."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const occ = data.metrics.occupancy;
  const forecastData = data.forecasts.map((f) => ({
    month: periodMonthShort(f.month),
    forecast: f.forecastOcc,
    lastYear: f.lastYearOcc,
    marketDemand: f.marketDemand,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {data.property.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {data.property.area} · {data.property.roomCount} rooms ·{" "}
          <span className="font-medium text-foreground">
            {periodLabel(params.period)}
          </span>
        </p>
      </div>

      {/* 1. Hero KPI row */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Occupancy"
          value={occ ? formatRatioPct(occ.actual) : "—"}
          budgetValue={occ ? formatRatioPct(occ.budget) : undefined}
          deltaPct={occ ? (occ.actual - occ.budget) * 100 : null}
          deltaUnit="pts"
        />
        <CurrencyKpi label="ADR" m={data.metrics.adr} />
        <CurrencyKpi label="RevPAR" m={data.metrics.revpar} />
        <CurrencyKpi label="Total Revenue" m={data.metrics.totalRevenue} />
        <CurrencyKpi label="Room Revenue" m={data.metrics.roomRevenue} />
      </section>

      {/* 2. Achievement table */}
      <SectionCard
        title="Achievement vs Budget"
        description={`Actual, budget, variance and achievement — ${periodLabel(params.period)}`}
      >
        <VarianceTable
          rows={data.revenueLines}
          firstColumnHeader="Metric"
          showLastYear
          total={false}
        />
      </SectionCard>

      {/* 3. Department contribution */}
      <SectionCard
        title="Department Contribution"
        description="Share of revenue by department (actual)"
      >
        {data.mix.length > 0 ? (
          <RevenueMixChart data={data.mix.map((s) => ({ label: s.label, value: s.value }))} />
        ) : (
          <p className="text-sm text-muted-foreground">No revenue mix for this period.</p>
        )}
      </SectionCard>

      {/* 4. Narrative */}
      <SectionCard
        title="Executive Summary"
        description="Management narrative for the period"
      >
        <NarrativePanel
          block={data.narratives.summary}
          section="SUMMARY"
          property={params.property}
          period={params.period}
        />
      </SectionCard>

      {/* 5. Two-column factors */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="External Factors" description="Market forces affecting performance">
          <Accordion
            numbered
            items={EXTERNAL_FACTORS.map((name, i) => ({
              title: name,
              content:
                i === 0 && data.narratives.external ? (
                  <div className="space-y-2">
                    {data.narratives.external.content
                      .split("\n")
                      .filter(Boolean)
                      .map((p, j) => (
                        <p key={j}>{p}</p>
                      ))}
                  </div>
                ) : (
                  <p>Not recorded for this period.</p>
                ),
            }))}
          />
        </SectionCard>

        <SectionCard title="Internal Factors & Forecast" description="Operational drivers and the 6-month outlook">
          {data.narratives.internal ? (
            <div className="space-y-2 text-sm leading-relaxed text-foreground">
              {data.narratives.internal.content
                .split("\n")
                .filter(Boolean)
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No internal factors recorded.</p>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-foreground">
              6-Month Forecast — Occupancy
            </p>
            {forecastData.length > 0 ? (
              <ForecastOccupancyChart data={forecastData} />
            ) : (
              <p className="text-sm text-muted-foreground">No forecast data for this period.</p>
            )}
            <Link
              href={`/dashboard/${params.property}/${params.period}/market-forecast`}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Full Market &amp; Forecast <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </SectionCard>
      </div>

      {/* Caption */}
      <p className="text-xs text-muted-foreground">
        Period status: {data.status === "FINAL" ? "Final" : "Draft"}
        {data.dataAsOf && <> · data as of {data.dataAsOf.slice(0, 10)}</>}
      </p>
    </div>
  );
}
