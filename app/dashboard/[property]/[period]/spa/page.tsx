import { notFound } from "next/navigation";

import { ActualBudgetBarChart } from "@/components/charts/actual-budget-bar-chart";
import { AdsBlock } from "@/components/dashboard/ads-block";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MoMBadge } from "@/components/dashboard/mom-badge";
import { NarrativeColumns } from "@/components/dashboard/narrative-columns";
import { SectionCard } from "@/components/dashboard/section-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { SpaSegmentTable } from "@/components/tables/spa-segment-table";
import { Card, CardContent } from "@/components/ui/card";
import { variancePct } from "@/lib/calculations";
import {
  GROUP_CODE,
  getSpaPageData,
  type GokaiMetric,
} from "@/lib/dashboard-data";
import { formatIDR, formatNumber, formatPercent, formatVariancePercent } from "@/lib/format";
import { periodLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SEG_LABEL: Record<string, string> = { IN_HOUSE: "In-House", OUTSIDE: "Outside", INCLUSION: "Inclusion" };

function Chip({ tone, children }: { tone: "good" | "bad" | "gold"; children: React.ReactNode }) {
  const cls =
    tone === "good"
      ? "border-variance-positive/40 bg-variance-positive/5 text-variance-positive"
      : tone === "bad"
        ? "border-variance-negative/40 bg-variance-negative/5 text-variance-negative"
        : "border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/5 text-[hsl(var(--brand-gold))]";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", cls)}>
      {children}
    </span>
  );
}

function SectionNote({ title, description, message }: { title: string; description?: string; message: string }) {
  return (
    <SectionCard title={title} description={description}>
      <p className="text-sm text-muted-foreground">{message}</p>
    </SectionCard>
  );
}

function fmtGokai(m: GokaiMetric): string {
  if (m.format === "idr") return formatIDR(m.value);
  if (m.format === "pct") return formatPercent(m.value);
  return formatNumber(m.value);
}

export default async function SpaPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Spa & Wellness" description="Consolidated view coming soon." />;
  }

  const data = await getSpaPageData(params.property, params.period);
  if (!data) notFound();
  if (!data.hasData) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook (SPA / ADS / GOKAI tabs) to populate this page."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const { property, overview, segments, treatments, gokai, narrative } = data;
  const fileBase = `${property.code}-${params.period}-spa`;

  const avgCheckAboveBudget =
    overview?.avgCheckActual != null &&
    overview?.avgCheckBudget != null &&
    overview.avgCheckActual > overview.avgCheckBudget;

  // Guest-segment auto insight (which segment beat budget and why)
  const segStats = segments.map((s) => ({
    label: SEG_LABEL[s.segment] ?? s.segment,
    revVar: variancePct(s.revenueActual, s.revenueBudget),
    coversVar: variancePct(s.coversActual, s.coversBudget),
    avgVar: s.avgCheckActual !== null && s.avgCheckBudget !== null ? variancePct(s.avgCheckActual, s.avgCheckBudget) : null,
  }));
  const beat = segStats
    .filter((s) => s.revVar !== null && s.revVar > 0)
    .sort((a, b) => (b.revVar ?? 0) - (a.revVar ?? 0))[0];
  const segInsight =
    beat && beat.coversVar !== null && beat.avgVar !== null
      ? `${beat.label} ${formatVariancePercent(beat.revVar)} on revenue despite ${formatVariancePercent(beat.coversVar)} covers — avg check ${formatVariancePercent(beat.avgVar)}.`
      : undefined;

  const segBarData = segments.map((s) => ({
    label: SEG_LABEL[s.segment] ?? s.segment,
    actual: s.revenueActual,
    budget: s.revenueBudget,
  }));

  const maxTreatmentRev = treatments.reduce((m, t) => Math.max(m, t.revenue), 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{property.spaName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {property.name} · Spa &amp; Wellness · {periodLabel(params.period)}
        </p>
      </div>

      {/* 1 — KPI strip */}
      {overview ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Covers"
            value={formatNumber(overview.covers.actual)}
            deltaPct={variancePct(overview.covers.actual, overview.covers.budget)}
            budgetValue={formatNumber(overview.covers.budget)}
          />
          <KpiCard
            label="Total Revenue"
            value={formatIDR(overview.revenue.actual)}
            deltaPct={variancePct(overview.revenue.actual, overview.revenue.budget)}
            budgetValue={formatIDR(overview.revenue.budget)}
          />
          <div className={cn("rounded-xl", avgCheckAboveBudget && "ring-2 ring-[hsl(var(--brand-gold))]/50")}>
            <KpiCard
              label="Average Check"
              value={overview.avgCheckActual !== null ? formatIDR(overview.avgCheckActual) : "—"}
              deltaPct={
                overview.avgCheckActual !== null && overview.avgCheckBudget !== null
                  ? variancePct(overview.avgCheckActual, overview.avgCheckBudget)
                  : null
              }
              budgetValue={overview.avgCheckBudget !== null ? formatIDR(overview.avgCheckBudget) : undefined}
            />
          </div>
          <StatTile label="Revenue Achievement" value={formatPercent(overview.revenueAchievementPct)} sub="of budget" />
        </section>
      ) : (
        <SectionNote title="Overview" message="Import the SPA tab to populate covers, revenue and average check." />
      )}

      {/* 2 — Guest segment performance */}
      {segments.length > 0 ? (
        <div className="space-y-6">
          <SectionCard
            title="Guest Segment Performance"
            description="Covers, average check and revenue vs budget by guest segment"
            insight={segInsight}
          >
            <SpaSegmentTable segments={segments} />
            {beat && (
              <div className="flex flex-wrap gap-2">
                <Chip tone="good">Beat budget · {beat.label} {formatVariancePercent(beat.revVar)}</Chip>
                {beat.avgVar !== null && (
                  <Chip tone="gold">{beat.label} avg check {formatVariancePercent(beat.avgVar)}</Chip>
                )}
                {beat.coversVar !== null && (
                  <Chip tone={beat.coversVar >= 0 ? "good" : "bad"}>{beat.label} covers {formatVariancePercent(beat.coversVar)}</Chip>
                )}
              </div>
            )}
          </SectionCard>

          <ExportableCard
            title="Revenue by Segment — Actual vs Budget"
            description="Guest-segment revenue against budget"
            fileName={`${fileBase}-segment-revenue`}
          >
            <ActualBudgetBarChart data={segBarData} />
          </ExportableCard>
        </div>
      ) : (
        <SectionNote
          title="Guest Segment Performance"
          description="In-House / Outside / Inclusion"
          message="No spa guest-segment data for this period yet."
        />
      )}

      {/* 3 — Top 10 treatments */}
      {treatments.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <ExportableCard title="Top Treatments by Revenue" description="Top 10, with treatment counts" fileName={`${fileBase}-treatments-bar`}>
            <div className="space-y-3">
              {treatments.map((t) => (
                <div key={t.rank} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="truncate font-medium text-foreground">{t.rank}. {t.treatmentName}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatNumber(t.count)}× · {formatIDR(t.revenue)}</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded bg-secondary">
                    <div className="h-full rounded bg-brand-teal" style={{ width: `${maxTreatmentRev > 0 ? (t.revenue / maxTreatmentRev) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </ExportableCard>

          <ExportableCard title="Treatment Detail" description="Count, revenue and average price" fileName={`${fileBase}-treatments-table`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Treatment</th>
                    <th className="px-3 py-2 text-right">Count</th>
                    <th className="px-3 py-2 text-right">Revenue</th>
                    <th className="px-3 py-2 text-right">Avg Price</th>
                  </tr>
                </thead>
                <tbody>
                  {treatments.map((t) => (
                    <tr key={t.rank} className="border-b border-border/60">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{t.rank}</td>
                      <td className="px-3 py-2 font-medium text-foreground">{t.treatmentName}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatNumber(t.count)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">{formatIDR(t.revenue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t.avgPrice !== null ? formatIDR(t.avgPrice) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ExportableCard>
        </div>
      ) : (
        <SectionNote title="Top Treatments" description="Ranked by revenue" message="No treatment data for this period yet." />
      )}

      {/* 4 — Spa ads */}
      <div>
        <h3 className="mb-3 text-lg font-semibold tracking-tight text-foreground">Spa Ads</h3>
        <AdsBlock
          ads={data.ads}
          spendRevenue={data.spendRevenue}
          roasTrend={data.roasTrend}
          fileBase={`${fileBase}-ads`}
          emptyLabel="Import the ADS tab (SPA unit) to populate ad performance."
        />
      </div>

      {/* 5 — Gokai panel */}
      {gokai ? (
        <SectionCard title="Gokai CRM" description={`Product engagement and upsell${gokai.unit === "HOTEL" ? " (hotel-level)" : ""}`}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {gokai.metrics.map((m) => (
              <StatTile
                key={m.key}
                label={m.label}
                value={fmtGokai(m)}
                sub={m.mom !== null ? <MoMBadge value={m.mom} /> : "no prior month"}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A top-viewed-products breakdown isn&apos;t captured in the data model yet — product views are shown in aggregate above.
          </p>
        </SectionCard>
      ) : (
        <SectionNote title="Gokai CRM" description="Product engagement and upsell" message="No Gokai report for this period yet." />
      )}

      {/* 6 — Narrative */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Spa Narrative</h3>
            <p className="mt-1 text-sm text-muted-foreground">What went well, what needs work, and the key takeaways.</p>
          </div>
          <NarrativeColumns block={narrative} section="SPA_OVERVIEW" property={params.property} period={params.period} />
        </CardContent>
      </Card>
    </div>
  );
}
