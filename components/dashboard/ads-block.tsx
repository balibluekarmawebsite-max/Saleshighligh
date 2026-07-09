import { RoasTrendChart } from "@/components/charts/roas-trend-chart";
import { SpendRevenueChart } from "@/components/charts/spend-revenue-chart";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { SectionCard } from "@/components/dashboard/section-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { Card, CardContent } from "@/components/ui/card";
import type { AdsSummary, RoasPoint } from "@/lib/dashboard-data";
import { formatIDR, formatNumber, formatPercent } from "@/lib/format";

const PLATFORM_LABEL: Record<string, string> = { GOOGLE: "Google", META: "Meta", CORPORATE: "Corporate" };
const PLATFORM_COLOR: Record<string, string> = { GOOGLE: "#0F4C5C", META: "#C9A227", CORPORATE: "#64748B" };

/**
 * Paid-advertising block shared by the Marketing (hotel) and Restaurant pages.
 * Renders spend/revenue/ROAS/clicks KPIs, per-platform cards, a spend-mix bar,
 * spend-vs-revenue chart and a 6-month ROAS trend.
 */
export function AdsBlock({
  ads,
  spendRevenue,
  roasTrend,
  fileBase,
  emptyLabel = "Import the ADS tab to populate ad performance.",
}: {
  ads: AdsSummary | null;
  spendRevenue: { platform: string; spend: number; revenue: number }[];
  roasTrend: RoasPoint[];
  fileBase: string;
  emptyLabel?: string;
}) {
  if (!ads) {
    return (
      <SectionCard title="Digital Ads" description="No ad data for this period">
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </SectionCard>
    );
  }

  const totalSpend = ads.totalSpend;
  const spendMix = ads.platforms;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total Spend" value={formatIDR(ads.totalSpend)} />
        <StatTile label="Tracked Revenue" value={formatIDR(ads.trackedRevenue)} />
        <StatTile
          label="ROAS"
          value={ads.roasPct !== null ? `${ads.roasPct.toFixed(0)}%` : "—"}
          sub={ads.roasRatio !== null ? `every Rp 1 → Rp ${ads.roasRatio.toFixed(2)}` : undefined}
        />
        <StatTile label="Total Clicks" value={formatNumber(ads.totalClicks)} />
      </section>

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

        <ExportableCard title="Spend vs Revenue" description="Attribution by platform" fileName={`${fileBase}-spend-revenue`}>
          <SpendRevenueChart data={spendRevenue} />
        </ExportableCard>
      </div>

      <ExportableCard title="6-Month ROAS Trend" description="Return on ad spend over time" fileName={`${fileBase}-roas-trend`}>
        {roasTrend.length > 1 ? (
          <RoasTrendChart data={roasTrend} />
        ) : (
          <p className="text-sm text-muted-foreground">Only one month of data so far — the trend appears once more periods are imported.</p>
        )}
      </ExportableCard>
    </div>
  );
}
