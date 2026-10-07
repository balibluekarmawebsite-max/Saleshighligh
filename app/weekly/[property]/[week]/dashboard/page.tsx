import { AlertCircle } from "lucide-react";

import { ActualBudgetBarChart } from "@/components/charts/actual-budget-bar-chart";
import { RevenueMixChart } from "@/components/charts/revenue-mix-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { SectionCard } from "@/components/dashboard/section-card";
import { ReportProgress } from "@/components/weekly/report-progress";
import { occPercent } from "@/lib/weekly/calculations";
import {
  getWeeklyDashboardData,
  kpiVariances,
  occPointsDelta,
} from "@/lib/weekly/dashboard-data";
import { getWeeklyScreenshots } from "@/lib/weekly/screenshot-data";
import { screenshotCategoryLabel } from "@/lib/weekly/screenshots";
import { getWeeklyAds } from "@/lib/weekly/ads-data";
import {
  formatIDR,
  formatNumber,
  formatWeeklyPercent,
} from "@/lib/weekly/format";

export const dynamic = "force-dynamic";

export default async function WeeklyDashboardPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const data = await getWeeklyDashboardData(params.property, params.week);

  if (!data || !data.headline) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
        <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">
          No data for this week yet
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Import this week&apos;s VHP figures, or pick a week that has data. The
          seeded demo week is{" "}
          <span className="font-medium text-foreground">25 Sep – 1 Oct 2026</span>{" "}
          for BKDS.
        </p>
      </div>
    );
  }

  const h = data.headline;
  const adr = kpiVariances(h.arrActual, h.arrBudget, h.arrLy);
  const rev = kpiVariances(h.revActual, h.revBudget, h.revLy);
  const screenshots = await getWeeklyScreenshots(params.property, params.week);
  const ads = await getWeeklyAds(params.property, params.week);
  const roasText = (n: number | null) => (n === null ? "—" : `${n.toFixed(2)}×`);

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Headline figures for{" "}
        <span className="font-medium text-foreground">{data.property.name}</span>
        {data.week ? ` · ${data.week.label}` : ""}
        {data.headlineMonthLabel
          ? ` · basis: ${data.headlineMonthLabel} (month-to-date)`
          : ""}
      </p>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label="Occupancy"
          value={formatWeeklyPercent(occPercent(h.occActual))}
          budgetValue={formatWeeklyPercent(occPercent(h.occBudget))}
          deltaPct={occPointsDelta(h.occActual, h.occBudget)}
          deltaUnit="pts"
          lastYearDeltaPct={null}
        />
        <KpiCard
          label="ADR"
          value={formatIDR(h.arrActual)}
          budgetValue={formatIDR(h.arrBudget)}
          deltaPct={adr.vsBudget}
          lastYearDeltaPct={adr.vsLy}
        />
        <KpiCard
          label="Room Revenue"
          value={formatIDR(h.revActual)}
          budgetValue={formatIDR(h.revBudget)}
          deltaPct={rev.vsBudget}
          lastYearDeltaPct={rev.vsLy}
        />
        <KpiCard
          label="Room Nights"
          value={formatNumber(h.rnSold)}
          deltaPct={null}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Room Revenue by Month"
          description="Actual vs Budget — year to date"
        >
          {data.monthlyRevenue.length > 0 ? (
            <ActualBudgetBarChart data={data.monthlyRevenue} />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No monthly figures yet.
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Channel Mix"
          description="Room nights by source — year to date"
        >
          {data.channelMix.length > 0 ? (
            <RevenueMixChart data={data.channelMix} valueFormat="number" />
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No channel data yet.
            </p>
          )}
        </SectionCard>
      </div>

      {/* SM screenshots + summaries */}
      {screenshots.length > 0 && (
        <SectionCard
          title="Social & OTA Screenshots"
          description="Booking.com, Instagram and other captures with their summaries"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {screenshots.map((s) => (
              <figure key={s.id} className="space-y-2 rounded-lg border border-border bg-card p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.imageUrl}
                  alt={s.title || screenshotCategoryLabel(s.category)}
                  className="w-full rounded-md border border-border object-contain"
                />
                <figcaption className="space-y-1">
                  <p className="text-xs font-medium text-foreground">
                    {screenshotCategoryLabel(s.category)}
                    {s.title ? ` · ${s.title}` : ""}
                  </p>
                  {s.summary && (
                    <p className="text-sm leading-relaxed text-muted-foreground">{s.summary}</p>
                  )}
                </figcaption>
              </figure>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Digital Ads & ROAS */}
      {ads.hasData && ads.blended && (
        <SectionCard
          title="Digital Ads & ROAS"
          description={ads.window.from ? `Ads window ${ads.window.from} → ${ads.window.to}` : "Google & Meta performance"}
        >
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { label: "Blended ROAS", value: roasText(ads.blended.roas) },
              { label: "Ad Spend", value: ads.blended.spend == null ? "—" : formatIDR(ads.blended.spend) },
              { label: "Booked Revenue", value: ads.blended.revenue == null ? "—" : formatIDR(ads.blended.revenue) },
              { label: "Conversions", value: ads.blended.conversions == null ? "—" : formatNumber(Math.round(ads.blended.conversions)) },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{k.value}</p>
              </div>
            ))}
          </div>

          {ads.platforms.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Platform</th>
                    <th className="py-2 pr-3 text-right font-medium">Spend</th>
                    <th className="py-2 pr-3 text-right font-medium">Conversions</th>
                    <th className="py-2 pr-3 text-right font-medium">Attributed Rev</th>
                    <th className="py-2 pr-3 text-right font-medium">ROAS</th>
                    <th className="py-2 pr-3 text-right font-medium">CTR</th>
                    <th className="py-2 text-right font-medium">CPC</th>
                  </tr>
                </thead>
                <tbody>
                  {ads.platforms.map((p) => (
                    <tr key={p.platform} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium text-foreground">{p.label}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{p.spend == null ? "—" : formatIDR(p.spend)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{p.conversions == null ? "—" : formatNumber(Math.round(p.conversions))}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{p.revenue == null ? "—" : formatIDR(p.revenue)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{roasText(p.roas)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{formatWeeklyPercent(p.ctr)}</td>
                      <td className="py-2 text-right tabular-nums text-foreground">{p.cpc == null ? "—" : formatIDR(p.cpc)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {/* Progress + about */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Report Progress"
          description="Section completion for this week"
        >
          <ReportProgress items={data.progress} />
        </SectionCard>

        <SectionCard title="About this week" description="How the headline is chosen">
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              The headline KPIs use the{" "}
              <span className="font-medium text-foreground">month-to-date</span>{" "}
              figures for the month the week ends in
              {data.headlineMonthLabel ? ` (${data.headlineMonthLabel})` : ""}, so
              the dashboard, narrative and exports all align on the same month.
            </p>
            <p>
              Variances compare Actual against Budget and Last Year. A value under
              target shows{" "}
              <span className="text-variance-negative">red</span>; over target shows{" "}
              <span className="text-variance-positive">green</span>.
            </p>
            {data.week && (
              <p className="text-foreground">
                Status:{" "}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  {data.week.status.replace(/_/g, " ").toLowerCase()}
                </span>
              </p>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
