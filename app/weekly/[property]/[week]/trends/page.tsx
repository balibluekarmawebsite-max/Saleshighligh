import { AlertCircle, TrendingUp } from "lucide-react";

import { WeeklyComparisonChart } from "@/components/charts/weekly-comparison-chart";
import { WeeklyKpiTrendChart } from "@/components/charts/weekly-kpi-trend-chart";
import { MoMBadge } from "@/components/dashboard/mom-badge";
import { SectionCard } from "@/components/dashboard/section-card";
import { Sparkline } from "@/components/dashboard/sparkline";
import { EMPTY, formatIDR, formatNumber, formatWeeklyPercent } from "@/lib/weekly/format";
import {
  getWeeklyTrendsData,
  type WeeklyKpiDelta,
} from "@/lib/weekly/trends-data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n === null ? EMPTY : formatWeeklyPercent(n));
const idr = (n: number | null) => (n === null ? EMPTY : formatIDR(n));
const int = (n: number | null) => (n === null ? EMPTY : formatNumber(n));

function KpiDeltaCard({ kpi }: { kpi: WeeklyKpiDelta }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{kpi.label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{kpi.value}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          vs prev week <MoMBadge value={kpi.delta} unit={kpi.deltaUnit} className="text-xs" />
        </span>
        {kpi.spark.length >= 2 && <Sparkline data={kpi.spark} />}
      </div>
    </div>
  );
}

export default async function WeeklyTrendsPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const data = await getWeeklyTrendsData(params.property, params.week);

  if (!data || data.series.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
        <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">No trend data yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Trends compare the headline KPIs across this property&apos;s weekly reports. Import or create a
          few weeks of data to see week-over-week movement.
        </p>
      </div>
    );
  }

  const selectedPoint = data.series.find((p) => p.isSelected);
  const trendData = data.series.map((p) => ({ label: p.label, revenue: p.revenue, occPct: p.occPct }));
  const comparisonData = data.comparison.map((c) => ({ code: c.code, revenue: c.revenue }));
  const seriesDesc = [...data.series].reverse();
  const usesFallbackWeek = data.comparison.some((c) => !c.matchesSelectedWeek && c.weekLabel !== null);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Week-over-week trends for{" "}
        <span className="font-medium text-foreground">{data.property.name}</span>
        {selectedPoint ? ` · ${selectedPoint.label}` : ""}
        {selectedPoint?.monthLabel ? ` · basis: ${selectedPoint.monthLabel} (month-to-date)` : ""}
      </p>

      {/* KPI deltas (anchored to the selected week) */}
      {data.kpis ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiDeltaCard kpi={data.kpis.occupancy} />
          <KpiDeltaCard kpi={data.kpis.adr} />
          <KpiDeltaCard kpi={data.kpis.revenue} />
          <KpiDeltaCard kpi={data.kpis.roomNights} />
        </div>
      ) : (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
          The selected week has no report, so week-over-week deltas aren&apos;t available — the charts and
          portfolio snapshot below use the weeks that do have data.
        </p>
      )}

      {/* Multi-week trend chart */}
      <SectionCard
        title="Headline trend"
        description="Room revenue (bars) and occupancy % (line) across reported weeks"
      >
        {data.series.length >= 2 ? (
          <WeeklyKpiTrendChart data={trendData} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Only one week of data so far — the trend chart appears once a second week is reported.
          </p>
        )}
      </SectionCard>

      {/* Week-by-week table */}
      <SectionCard title="Week by week" description="Headline figures for each reported week (newest first)">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Week</th>
                <th className="py-2 pr-3 font-medium">Basis</th>
                <th className="py-2 pr-3 text-right font-medium">Occupancy</th>
                <th className="py-2 pr-3 text-right font-medium">ADR</th>
                <th className="py-2 pr-3 text-right font-medium">Room Revenue</th>
                <th className="py-2 text-right font-medium">Room Nights</th>
              </tr>
            </thead>
            <tbody>
              {seriesDesc.map((p) => (
                <tr
                  key={p.week}
                  className={cn("border-b border-border/60", p.isSelected && "bg-secondary/60 font-medium")}
                >
                  <td className="py-2 pr-3 text-foreground">{p.label}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{p.monthLabel ?? EMPTY}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{pct(p.occPct)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{idr(p.adr)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{idr(p.revenue)}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{int(p.roomNights)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Social movement for the selected week */}
      {data.social.length > 0 && (
        <SectionCard title="Social movement" description="This week vs last week, by platform and metric">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 pr-3 font-medium">Platform</th>
                  <th className="py-2 pr-3 font-medium">Metric</th>
                  <th className="py-2 pr-3 text-right font-medium">Last Week</th>
                  <th className="py-2 pr-3 text-right font-medium">This Week</th>
                  <th className="py-2 text-right font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {data.social.map((s, i) => (
                  <tr key={i} className="border-b border-border/60">
                    <td className="py-2 pr-3 text-foreground">{s.platform}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{s.metric}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">{int(s.lastWeek)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-foreground">{int(s.thisWeek)}</td>
                    <td className="py-2 text-right"><MoMBadge value={s.growthPct} className="justify-end text-xs" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* Cross-property snapshot */}
      <SectionCard
        title="Portfolio snapshot"
        description={`Headline figures across properties for ${selectedPoint?.label ?? "the selected week"}`}
      >
        <WeeklyComparisonChart data={comparisonData} currentCode={data.property.code} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr className="border-b border-border">
                <th className="py-2 pr-3 font-medium">Property</th>
                <th className="py-2 pr-3 font-medium">Week</th>
                <th className="py-2 pr-3 text-right font-medium">Occupancy</th>
                <th className="py-2 pr-3 text-right font-medium">ADR</th>
                <th className="py-2 text-right font-medium">Room Revenue</th>
              </tr>
            </thead>
            <tbody>
              {data.comparison.map((c) => (
                <tr
                  key={c.code}
                  className={cn("border-b border-border/60", c.code === data.property.code && "bg-secondary/60 font-medium")}
                >
                  <td className="py-2 pr-3 text-foreground">{c.code} · {c.name}</td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {c.weekLabel ?? EMPTY}
                    {!c.matchesSelectedWeek && c.weekLabel !== null && (
                      <span className="ml-1 text-xs text-[hsl(var(--brand-gold))]">(latest)</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{pct(c.occPct)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-foreground">{idr(c.adr)}</td>
                  <td className="py-2 text-right tabular-nums text-foreground">{idr(c.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {usesFallbackWeek && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="text-[hsl(var(--brand-gold))]">(latest)</span> — this property has no report for the
              selected week, so its most recent week is shown.
            </p>
          )}
        </div>
      </SectionCard>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" aria-hidden />
        Headline figures use each week&apos;s month-to-date basis, so trends stay comparable across weeks and properties.
      </p>
    </div>
  );
}
