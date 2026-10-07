import { Sparkles, TrendingUp } from "lucide-react";

import { AdsTrendChart } from "@/components/charts/ads-trend-chart";
import { SectionCard } from "@/components/dashboard/section-card";
import { Sparkline } from "@/components/dashboard/sparkline";
import { formatIDR, formatNumber } from "@/lib/format";
import { type WeeklyAdsData } from "@/lib/weekly/ads-data";

const money = (n: number | null) => (n == null ? "—" : formatIDR(n));
const num = (n: number | null) => (n == null ? "—" : formatNumber(Math.round(n)));
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}%`);
const roas = (n: number | null) => (n == null ? "—" : `${n.toFixed(2)}×`);

/** Rich Digital Ads & ROAS preview: summary, KPI cards + sparklines, trend, split, campaigns. */
export function AdsOverview({ ads }: { ads: WeeklyAdsData }) {
  const b = ads.blended;
  if (!ads.hasData || !b) return null;

  const d = ads.daily;
  const col = (pick: (p: (typeof d)[number]) => number | null): number[] => d.map((p) => pick(p) ?? 0);
  const ctrDaily = d.map((p) => (p.impressions ? ((p.clicks ?? 0) / p.impressions) * 100 : 0));
  const cpcDaily = d.map((p) => (p.clicks ? (p.spend ?? 0) / p.clicks : 0));
  const roasDaily = d.map((p) => (p.spend ? (p.conversionValue ?? 0) / p.spend : 0));

  const cards: { label: string; value: string; series: number[] }[] = [
    { label: "Spend", value: money(b.spend), series: col((p) => p.spend) },
    { label: "Impressions", value: num(b.impressions), series: col((p) => p.impressions) },
    { label: "Reach", value: num(b.reach), series: col((p) => p.reach) },
    { label: "Clicks", value: num(b.clicks), series: col((p) => p.clicks) },
    { label: "CTR", value: pct(b.ctr), series: ctrDaily },
    { label: "CPC", value: money(b.cpc), series: cpcDaily },
    { label: "Revenue", value: money(b.revenue), series: col((p) => p.conversionValue) },
    { label: "ROAS", value: roas(b.roas), series: roasDaily },
  ];

  const trend = d.map((p) => ({
    date: p.date,
    spend: p.spend ?? 0,
    impressions: p.impressions ?? 0,
    clicks: p.clicks ?? 0,
    conversions: p.conversions ?? 0,
  }));

  const maxSpend = Math.max(...ads.platforms.map((p) => p.spend ?? 0), 1);
  const topCampaigns = ads.campaigns.slice(0, 12);

  return (
    <SectionCard
      title="Digital Ads & ROAS"
      description={ads.window.from ? `Ads window ${ads.window.from} → ${ads.window.to}` : "Google & Meta performance"}
    >
      <div className="space-y-6">
        {/* Summary */}
        {ads.summary && (
          <div className="rounded-lg border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 p-4">
            <p className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-[hsl(var(--brand-gold))]">
              <Sparkles className="h-3.5 w-3.5" /> Summary
            </p>
            <p className="text-sm font-medium leading-relaxed text-foreground">{ads.summary.headline}</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Highlights</p>
                <ul className="mt-1 space-y-1 text-sm text-foreground">
                  {ads.summary.highlights.map((h, i) => <li key={i}>• {h}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recommendations</p>
                <ul className="mt-1 space-y-1 text-sm text-foreground">
                  {ads.summary.recommendations.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {cards.map((c) => (
            <div key={c.label} className="rounded-lg border border-border bg-card p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
              <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{c.value}</p>
              {c.series.length >= 2 && <Sparkline data={c.series} className="mt-1.5 w-full" width={140} height={26} />}
            </div>
          ))}
        </div>

        {/* Performance over time */}
        {trend.length >= 2 && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
              <TrendingUp className="h-4 w-4 text-muted-foreground" /> Performance over time
            </p>
            <AdsTrendChart data={trend} />
          </div>
        )}

        {/* Google vs Meta */}
        {ads.platforms.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Google vs Meta</p>
            <div className="space-y-3">
              {ads.platforms.map((p) => (
                <div key={p.platform}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">{p.label}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {money(p.spend)} · {num(p.conversions)} conv · <span className="font-medium text-foreground">{roas(p.roas)}</span>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      className={p.platform === "google" ? "h-full rounded-full bg-brand-teal" : "h-full rounded-full bg-brand-gold"}
                      style={{ width: `${Math.max(2, Math.round(((p.spend ?? 0) / maxSpend) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Campaigns */}
        {topCampaigns.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Campaigns</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">Campaign</th>
                    <th className="py-2 pr-3 font-medium">Platform</th>
                    <th className="py-2 pr-3 text-right font-medium">Impr.</th>
                    <th className="py-2 pr-3 text-right font-medium">Clicks</th>
                    <th className="py-2 pr-3 text-right font-medium">Spend</th>
                    <th className="py-2 pr-3 text-right font-medium">Conv.</th>
                    <th className="py-2 text-right font-medium">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {topCampaigns.map((c) => (
                    <tr key={c.campaignId} className="border-b border-border/60">
                      <td className="max-w-[260px] truncate py-2 pr-3 text-foreground" title={c.name}>{c.name}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{c.platformLabel}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{num(c.impressions)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{num(c.clicks)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{money(c.spend)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums text-foreground">{num(c.conversions)}</td>
                      <td className="py-2 text-right tabular-nums text-foreground">{roas(c.roas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ads.campaigns.length > topCampaigns.length && (
                <p className="px-1 pt-1 text-xs text-muted-foreground">…and {ads.campaigns.length - topCampaigns.length} more campaigns.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
