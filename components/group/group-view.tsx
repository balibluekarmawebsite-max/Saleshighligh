import Link from "next/link";
import { Award, Star, TrendingUp, Trophy } from "lucide-react";

import { GroupForecastChart } from "@/components/charts/group-forecast-chart";
import { GroupGroupedBar } from "@/components/charts/group-grouped-bar";
import { GroupTrendChart } from "@/components/charts/group-trend-chart";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { SectionCard } from "@/components/dashboard/section-card";
import { GroupSummaryPanel } from "@/components/group/group-summary-panel";
import { Card, CardContent } from "@/components/ui/card";
import { getGroupData, type GroupKpiCell } from "@/lib/group-data";
import { formatIDRCompact, formatNumber, formatPercent, formatRatioPct } from "@/lib/format";
import { periodLabel } from "@/lib/labels";

function fmtVal(cell: GroupKpiCell, format: "ratio" | "idr"): string {
  if (cell.actual == null) return "—";
  return format === "ratio" ? formatRatioPct(cell.actual) : formatIDRCompact(cell.actual);
}

/** Red→green background/text scale keyed to achievement % (85 → red, 105 → green). */
function achStyle(pct: number | null): React.CSSProperties {
  if (pct == null) return {};
  const t = Math.max(0, Math.min(1, (pct - 85) / 20));
  const hue = Math.round(t * 120);
  return { backgroundColor: `hsl(${hue} 72% 93%)`, color: `hsl(${hue} 55% 26%)` };
}

export async function GroupView({ period }: { period: string }) {
  const g = await getGroupData(period);

  if (!g.hasData) {
    return (
      <div className="mx-auto max-w-6xl space-y-8">
        <Header period={period} />
        <EmptyState
          title={`No data for the Group · ${periodLabel(period)}`}
          message="Import at least one property's monthly workbook for this period to populate the consolidated view."
          actionHref="/admin/import"
          actionLabel="Import data"
        />
      </div>
    );
  }

  const fileBase = `group-${period}`;
  const l = g.leaderboards;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <Header period={period} />

      {/* 1 — Group scorecard */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {g.kpis.map((k) => (
          <Card key={k.key}>
            <CardContent className="p-5">
              <p className="text-sm font-medium text-muted-foreground">{k.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{fmtVal(k.group, k.format)}</p>
              <p className="mt-1 text-xs">
                {k.group.achievement != null ? (
                  <span className="rounded px-1.5 py-0.5 font-medium" style={achStyle(k.group.achievement)}>{formatPercent(k.group.achievement)} of budget</span>
                ) : (
                  <span className="text-muted-foreground">no budget</span>
                )}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 2 — Property comparison matrix */}
      <SectionCard title="Property Comparison Matrix" description="Actual by property with achievement-scaled colour · click a cell to open that property's page">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2 text-left">KPI</th>
                {g.properties.map((p) => (
                  <th key={p.code} className="px-3 py-2 text-right">{p.code}</th>
                ))}
                <th className="px-3 py-2 text-right text-foreground">Group</th>
              </tr>
            </thead>
            <tbody>
              {g.kpis.map((k) => (
                <tr key={k.key} className="border-b border-border/60">
                  <td className="px-3 py-2 font-medium text-foreground">{k.label}</td>
                  {g.properties.map((p) => {
                    const cell = k.perProperty[p.code] ?? { actual: null, budget: null, achievement: null };
                    return (
                      <td key={p.code} className="px-1 py-1 text-right">
                        <Link
                          href={`/dashboard/${p.code}/${period}/${k.section}`}
                          className="block rounded px-2 py-1 tabular-nums transition-opacity hover:opacity-80"
                          style={achStyle(cell.achievement)}
                          title={cell.achievement != null ? `${formatPercent(cell.achievement)} of budget` : undefined}
                        >
                          <span className="block font-medium">{fmtVal(cell, k.format)}</span>
                          <span className="block text-[10px] opacity-80">{cell.achievement != null ? formatPercent(cell.achievement) : "—"}</span>
                        </Link>
                      </td>
                    );
                  })}
                  <td className="px-1 py-1 text-right">
                    <div className="rounded px-2 py-1 tabular-nums font-semibold" style={achStyle(k.group.achievement)}>
                      <span className="block">{fmtVal(k.group, k.format)}</span>
                      <span className="block text-[10px] opacity-80">{k.group.achievement != null ? formatPercent(k.group.achievement) : "—"}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* 3 — Comparative charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ExportableCard title="Revenue by Property" description="Total revenue, stacked, last 12 months" fileName={`${fileBase}-revenue-trend`}>
          {g.revenueTrend.months.length > 0 ? <GroupTrendChart months={g.revenueTrend.months} series={g.revenueTrend.series} /> : <Empty />}
        </ExportableCard>
        <ExportableCard title="Achievement % by Department" description="Revenue achievement vs budget, grouped by property" fileName={`${fileBase}-dept-achievement`}>
          <GroupGroupedBar categories={g.deptAchievement.categories} series={g.deptAchievement.series} reference={100} />
        </ExportableCard>
        <ExportableCard title="ROAS by Unit" description="Return on ad spend across properties and units" fileName={`${fileBase}-roas`}>
          <GroupGroupedBar categories={g.roas.categories} series={g.roas.series} />
        </ExportableCard>
        <ExportableCard title="6-Month Forecast" description="Occupancy by property vs the market-demand band" fileName={`${fileBase}-forecast`}>
          {g.forecast.months.length > 0 ? (
            <GroupForecastChart months={g.forecast.months} series={g.forecast.series} demandLow={g.forecast.demandLow} demandHigh={g.forecast.demandHigh} />
          ) : (
            <Empty />
          )}
        </ExportableCard>
      </div>

      <SectionCard title="Top Nationalities — Group" description="Merged room nights across the three properties">
        {g.nationalities.length > 0 ? (
          <div className="space-y-2">
            {g.nationalities.map((n, i) => {
              const max = g.nationalities[0]!.roomNights || 1;
              return (
                <div key={n.countryName} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{i + 1}. {n.countryName}</span>
                    <span className="tabular-nums text-muted-foreground">{formatNumber(n.roomNights)} RN</span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded bg-secondary">
                    <div className="h-full rounded bg-brand-teal" style={{ width: `${(n.roomNights / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty />
        )}
      </SectionCard>

      {/* 4 — Leaderboards */}
      <SectionCard title="Group Leaderboards" description="Standout results across the portfolio this month">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Leader icon={<Award className="h-4 w-4" />} label="Best ROAS campaign" value={l.bestRoas ? `${l.bestRoas.roasPct.toFixed(0)}%` : "—"} sub={l.bestRoas ? `${l.bestRoas.property} · ${l.bestRoas.unit} · ${l.bestRoas.platform}` : "no ad data"} />
          <Leader icon={<Star className="h-4 w-4" />} label="Best Tripadvisor" value={l.bestTripadvisor ? `#${l.bestTripadvisor.rank}` : "—"} sub={l.bestTripadvisor ? `${l.bestTripadvisor.property}${l.bestTripadvisor.total != null ? " of " + formatNumber(l.bestTripadvisor.total) : ""}` : "no ranking"} />
          <Leader icon={<TrendingUp className="h-4 w-4" />} label="Biggest social growth" value={l.bestSocial ? `${l.bestSocial.momPct >= 0 ? "+" : ""}${l.bestSocial.momPct.toFixed(1)}%` : "—"} sub={l.bestSocial ? `${l.bestSocial.property} · reach MoM` : "no prior month"} />
          <Leader icon={<Trophy className="h-4 w-4" />} label="Top account" value={l.topAccount ? formatIDRCompact(l.topAccount.revenue) : "—"} sub={l.topAccount ? `${l.topAccount.property} · ${l.topAccount.accountName}` : "no account data"} />
        </div>
      </SectionCard>

      {/* 5 — AI group summary */}
      <SectionCard title="AI Group Summary" description="Claude-generated executive brief comparing the three properties">
        <GroupSummaryPanel period={period} />
      </SectionCard>
    </div>
  );
}

function Header({ period }: { period: string }) {
  return (
    <div>
      <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">🏢 Blue Karma Group</h2>
      <p className="mt-1 text-sm text-muted-foreground">Consolidated cross-property view · {periodLabel(period)}</p>
    </div>
  );
}

function Leader({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span className="text-[hsl(var(--brand-gold))]">{icon}</span>
        {label}
      </p>
      <p className="mt-1.5 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted-foreground">No data for this period yet.</p>;
}
