import { notFound } from "next/navigation";

import { RankTrendChart } from "@/components/charts/rank-trend-chart";
import { SpendRevenueChart } from "@/components/charts/spend-revenue-chart";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { MoMBadge } from "@/components/dashboard/mom-badge";
import { SectionCard } from "@/components/dashboard/section-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent } from "@/components/ui/card";
import { AdsSyncButton } from "@/components/sales/ads-sync-button";
import { OtaRankingPanel } from "@/components/sales/ota-ranking-panel";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { GROUP_CODE, getMarketingPageData } from "@/lib/dashboard-data";
import { formatIDR, formatNumber, formatPercent } from "@/lib/format";
import { periodLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const PLATFORM_LABEL: Record<string, string> = { GOOGLE: "Google", META: "Meta", CORPORATE: "Corporate" };
const PLATFORM_COLOR: Record<string, string> = { GOOGLE: "#0F4C5C", META: "#C9A227", CORPORATE: "#64748B" };

export default async function MarketingPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Digital Ads & Reputation" description="Consolidated view coming soon." />;
  }

  const me = await getCurrentUser();
  const canEdit = canEditProperty(me, params.property);
  const data = await getMarketingPageData(params.property, params.period);
  if (!data) notFound();
  if (!data.hasData) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook (ADS / REPUTATION / SOCIAL tabs) to populate this page."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const ads = data.ads;
  const totalSpend = ads?.totalSpend ?? 0;
  const spendMix = ads?.platforms ?? [];
  const fileBase = `${data.property.code}-${params.period}-marketing`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{data.property.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Digital Ads &amp; Online Reputation · {periodLabel(params.period)}
        </p>
      </div>

      {/* Ads KPIs */}
      {ads ? (
        <>
          {canEdit && (
            <div className="flex justify-end">
              <AdsSyncButton property={params.property} period={params.period} variant="link" />
            </div>
          )}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Total Spend" value={formatIDR(ads.totalSpend)} />
            <StatTile label="Revenue" value={formatIDR(ads.trackedRevenue)} />
            <StatTile
              label="ROAS"
              value={ads.roasPct !== null ? `${ads.roasPct.toFixed(0)}%` : "—"}
              sub={ads.roasRatio !== null ? `every Rp 1 → Rp ${ads.roasRatio.toFixed(2)}` : undefined}
            />
            <StatTile label="Total Clicks" value={formatNumber(ads.totalClicks)} />
          </section>

          {/* Platform breakdown */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ads.platforms.map((p) => (
              <Card key={p.platform}>
                <CardContent className="space-y-2 p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[p.platform] }} />
                    {PLATFORM_LABEL[p.platform] ?? p.platform}
                  </p>
                  <dl className="space-y-1 text-sm">
                    {[
                      ["Spend", formatIDR(p.spend)],
                      ["Impressions", formatNumber(p.impressions)],
                      ["Clicks", formatNumber(p.clicks)],
                      ["Reach", p.reach !== null ? formatNumber(p.reach) : "—"],
                      ["CTR", p.ctr !== null ? formatPercent(p.ctr) : "—"],
                      ["CPC", p.cpc !== null ? formatIDR(p.cpc) : "—"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="tabular-nums text-foreground">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </section>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <ExportableCard title="Spend by Platform" description="Share of total ad spend" fileName={`${fileBase}-spend-mix`}>
              <div className="space-y-3">
                <div className="flex h-5 w-full overflow-hidden rounded">
                  {spendMix.map((p) => (
                    <div
                      key={p.platform}
                      style={{ width: `${totalSpend > 0 ? (p.spend / totalSpend) * 100 : 0}%`, backgroundColor: PLATFORM_COLOR[p.platform] }}
                      title={`${PLATFORM_LABEL[p.platform] ?? p.platform}: ${formatIDR(p.spend)}`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {spendMix.map((p) => (
                    <span key={p.platform} className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[p.platform] }} />
                      {PLATFORM_LABEL[p.platform] ?? p.platform} · {formatIDR(p.spend)}
                    </span>
                  ))}
                </div>
              </div>
            </ExportableCard>

            <ExportableCard title="Spend vs Revenue" description="Ad-tracked conversion value by platform" fileName={`${fileBase}-spend-revenue`}>
              <SpendRevenueChart data={data.spendRevenue} />
            </ExportableCard>
          </div>
        </>
      ) : (
        <SectionCard title="Digital Ads" description="No ad data for this period">
          <p className="text-sm text-muted-foreground">
            Pull this month&rsquo;s spend, ROAS and platform split straight from the ads dashboard — the same source as
            the weekly report.
          </p>
          {canEdit ? (
            <div className="mt-3">
              <AdsSyncButton property={params.property} period={params.period} />
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Ask an editor to sync, or import the ADS tab.</p>
          )}
        </SectionCard>
      )}

      {/* OTA ranking */}
      <SectionCard title="OTA Ranking Tracker" description="Current position and month-over-month movement (lower rank is better)">
        <OtaRankingPanel
          property={params.property}
          period={params.period}
          rankCards={data.rankCards}
          rankHistory={data.rankHistory}
          canEdit={canEdit}
        />
      </SectionCard>

      <ExportableCard title="12-Month Rank Trend" description="Up = better (rank number lower)" fileName={`${fileBase}-rank-trend`}>
        {data.rankTrend.length > 1 ? (
          <RankTrendChart data={data.rankTrend} />
        ) : (
          <p className="text-sm text-muted-foreground">Only one month of data so far — the trend appears once more periods are imported.</p>
        )}
      </ExportableCard>

      {/* Tripadvisor */}
      {data.tripadvisor && (
        <SectionCard title="Tripadvisor" description="Hotel listing performance">
          <div className="rounded-lg bg-secondary/50 p-4">
            <p className="text-lg font-semibold text-foreground">
              {data.tripadvisor.rank !== null ? `#${data.tripadvisor.rank}` : "—"}
              {data.tripadvisor.totalInMarket !== null && (
                <span className="font-normal text-muted-foreground"> of {formatNumber(data.tripadvisor.totalInMarket)} in {data.tripadvisor.area}</span>
              )}
              {data.tripadvisor.rating !== null && (
                <span className="font-normal text-muted-foreground"> · {data.tripadvisor.rating.toFixed(1)}/5</span>
              )}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.tripadvisor.metrics.map((m) => (
              <StatTile
                key={m.key}
                label={m.label}
                value={formatNumber(m.value)}
                sub={m.mom !== null ? <MoMBadge value={m.mom} /> : "no prior month"}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
