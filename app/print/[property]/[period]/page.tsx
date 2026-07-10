import { notFound } from "next/navigation";

import { achievementPct, variancePct } from "@/lib/calculations";
import {
  getGuestsPageData,
  getMarketPageData,
  getMarketingPageData,
  getPlansPageData,
  getRestaurantPageData,
  getRoomTypesPageData,
  getSegmentsPageData,
  getSocialPageData,
  getSpaPageData,
  getSummaryPageData,
} from "@/lib/dashboard-data";
import { formatIDRCompact, formatNumber, formatPercent, formatRatioPct, formatVariancePercent } from "@/lib/format";
import { periodLabel } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined) => (n == null ? "—" : formatIDRCompact(n));
const num = (n: number | null | undefined) => (n == null ? "—" : formatNumber(n));
const pct = (n: number | null | undefined) => (n == null ? "—" : formatPercent(n));

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table>
      <thead>
        <tr>{head.map((h, i) => <th key={i} className={i === 0 ? "l" : "r"}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>{r.map((c, ci) => <td key={ci} className={ci === 0 ? "l" : "r"}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function Prose({ text }: { text: string | null | undefined }) {
  if (!text || !text.trim()) return <p className="muted">Not written for this period yet.</p>;
  return (
    <>
      {text.split("\n").filter(Boolean).map((p, i) => (
        <p key={i} className="prose">{p}</p>
      ))}
    </>
  );
}

export default async function PrintPage({
  params,
  searchParams,
}: {
  params: { property: string; period: string };
  searchParams: { sections?: string };
}) {
  const { property: code, period } = params;
  const sel = searchParams.sections ? new Set(searchParams.sections.split(",")) : null;
  const show = (id: string) => !sel || sel.has(id);
  const property = await prisma.property.findUnique({
    where: { code },
    select: { name: true, area: true, restaurantName: true, spaName: true },
  });
  if (!property) notFound();

  const [summary, segMtd, segYtd, roomTypes, guests, marketing, restaurant, spa, market, plans, social] = await Promise.all([
    getSummaryPageData(code, period),
    getSegmentsPageData(code, period, "MTD"),
    getSegmentsPageData(code, period, "YTD"),
    getRoomTypesPageData(code, period),
    getGuestsPageData(code, period),
    getMarketingPageData(code, period),
    getRestaurantPageData(code, period),
    getSpaPageData(code, period),
    getMarketPageData(code, period),
    getPlansPageData(code, period),
    getSocialPageData(code, period),
  ]);

  const SEG: Record<string, string> = { IN_HOUSE: "In-House", OUTSIDE: "Outside", INCLUSION: "Inclusion" };
  const UNIT: Record<string, string> = { HOTEL: "Hotel", RESTAURANT: "Restaurant", SPA: "Spa" };

  return (
    <div className="print-root">
      <style>{PRINT_CSS}</style>

      <div className="cover">
        <p className="kicker">SALES HIGHLIGHT</p>
        <h1>{property.name}</h1>
        <p className="sub">{periodLabel(period)} · {property.area}</p>
        <p className="brand">Blue Karma Group</p>
      </div>

      {show("summary") && summary?.hasData && (
        <Section title="Executive Summary — Achievement vs Budget">
          <Table
            head={["Metric", "Actual", "Budget", "Last Year", "Achievement", "Variance"]}
            rows={summary.revenueLines.map((l) => {
              const isRatio = l.format === "ratio";
              const varStr = isRatio
                ? `${(l.actual - l.budget) * 100 >= 0 ? "+" : ""}${((l.actual - l.budget) * 100).toFixed(2)} pts`
                : formatVariancePercent(variancePct(l.actual, l.budget));
              return [
                l.label,
                isRatio ? formatRatioPct(l.actual) : money(l.actual),
                isRatio ? formatRatioPct(l.budget) : money(l.budget),
                l.lastYear == null ? "—" : isRatio ? formatRatioPct(l.lastYear) : money(l.lastYear),
                pct(achievementPct(l.actual, l.budget)),
                varStr,
              ];
            })}
          />
          <Prose text={summary.narratives.summary?.content} />
        </Section>
      )}

      {show("factors") && summary && (summary.narratives.external || summary.narratives.internal) && (
        <Section title="External & Internal Factors">
          <h3>External</h3>
          <Prose text={summary.narratives.external?.content} />
          <h3>Internal</h3>
          <Prose text={summary.narratives.internal?.content} />
        </Section>
      )}

      {show("rooms") && [{ d: segMtd, label: "MTD" }, { d: segYtd, label: "YTD" }].map(({ d, label }) =>
        d && d.hasData && d.segments.length > 0 ? (
          <Section key={label} title={`Market Segment — ${label}`}>
            <Table
              head={["Segment", "RN Act", "RN Bud", "ARR Act", "Rev Act", "Rev Bud", "Ach %"]}
              rows={d.segments.slice(0, 12).map((s) => [s.name, num(s.actual.rn), num(s.budget.rn), money(s.actual.arr), money(s.actual.revenue), money(s.budget.revenue), pct(achievementPct(s.actual.revenue, s.budget.revenue))])}
            />
          </Section>
        ) : null,
      )}

      {show("rooms") && segYtd && segYtd.accounts.length > 0 && (
        <Section title="Account Production (YTD)">
          <Table
            head={["#", "Account", "Type", "Room Nights", "Revenue", "% of Rev"]}
            rows={segYtd.accounts.slice(0, 15).map((a) => [a.rank, a.accountName, a.accountType, num(a.roomNights), money(a.revenue), `${a.pctOfRevenue.toFixed(1)}%`])}
          />
        </Section>
      )}

      {show("rooms") && roomTypes?.hasData && roomTypes.roomTypes.length > 0 && (
        <Section title="Room Type Analytics">
          <Table
            head={["Room Type", "RN Act", "RN Bud", "ADR Act", "ADR Bud", "Rev Act", "Ach %"]}
            rows={roomTypes.roomTypes.map((r) => [r.roomTypeName, num(r.roomNightsActual), num(r.roomNightsBudget), money(r.adrActual), money(r.adrBudget), money(r.revenueActual), pct(achievementPct(r.revenueActual, r.revenueBudget))])}
          />
          <Prose text={roomTypes.narrative?.content} />
        </Section>
      )}

      {show("rooms") && guests?.hasData && guests.nationalities.length > 0 && (
        <Section title="Nationality & Length of Stay">
          <Table head={["#", "Nationality", "Room Nights", "Share", "vs LY RN"]} rows={guests.nationalities.slice(0, 10).map((n) => [n.rank, n.countryName, num(n.roomNights), `${n.sharePct.toFixed(1)}%`, n.lastYearRoomNights == null ? "—" : num(n.lastYearRoomNights)])} />
          <p className="muted">Average LOS {guests.avgLos != null ? guests.avgLos.toFixed(2) : "—"} nights · 3+ nights {guests.share3Plus != null ? guests.share3Plus.toFixed(1) : "—"}%</p>
          <Table head={["LOS (nights)", "Bookings", "Room Nights", "Share"]} rows={guests.losBuckets.map((l) => [l.bucket, num(l.bookings), num(l.roomNights), `${l.sharePct.toFixed(1)}%`])} />
        </Section>
      )}

      {show("marketing") && marketing?.hasData && marketing.ads && (
        <Section title="Digital Ads & ROAS">
          <p className="muted">Spend {money(marketing.ads.totalSpend)} · Tracked Revenue {money(marketing.ads.trackedRevenue)} · ROAS {marketing.ads.roasPct != null ? marketing.ads.roasPct.toFixed(0) + "%" : "—"} · Clicks {num(marketing.ads.totalClicks)}</p>
          <Table head={["Platform", "Spend", "Impr.", "Clicks", "CTR", "CPC", "Revenue"]} rows={marketing.ads.platforms.map((p) => [p.platform, money(p.spend), num(p.impressions), num(p.clicks), p.ctr != null ? formatPercent(p.ctr) : "—", money(p.cpc), money(p.trackedRevenue)])} />
        </Section>
      )}

      {show("marketing") && marketing?.hasData && (marketing.rankCards.length > 0 || marketing.tripadvisor) && (
        <Section title="Online Reputation">
          {marketing.rankCards.length > 0 && (
            <Table head={["Platform", "Rank", "Of", "MoM Change"]} rows={marketing.rankCards.map((r) => [r.platform, r.rank != null ? `#${r.rank}` : "—", r.totalInMarket != null ? num(r.totalInMarket) : "—", r.change == null ? "—" : r.change > 0 ? `+${r.change} improved` : r.change < 0 ? `${r.change} dropped` : "no change"])} />
          )}
          {marketing.tripadvisor && (
            <p className="muted">Tripadvisor {marketing.tripadvisor.rank != null ? "#" + marketing.tripadvisor.rank : "—"}{marketing.tripadvisor.rating != null ? " · " + marketing.tripadvisor.rating.toFixed(1) + "/5" : ""} in {marketing.tripadvisor.area}</p>
          )}
        </Section>
      )}

      {show("restaurant") && restaurant?.hasData && (
        <Section title={`${restaurant.property.restaurantName} — Restaurant`}>
          {restaurant.overview && (
            <p className="muted">Covers {num(restaurant.overview.covers.actual)} · Revenue {money(restaurant.overview.revenue.actual)} · Avg Check {money(restaurant.overview.avgCheckActual)} · Rev Ach {pct(restaurant.overview.revenueAchievementPct)}</p>
          )}
          {restaurant.meals.length > 0 && (
            <Table head={["Meal", "Covers", "Avg Check", "Rev Act", "Rev Bud", "% of Rev"]} rows={restaurant.meals.map((m) => [m.meal, num(m.coversActual), money(m.avgCheckActual), money(m.revenueActual), money(m.revenueBudget), `${m.pctOfRevenue.toFixed(1)}%`])} />
          )}
          <Prose text={restaurant.narrative?.content} />
        </Section>
      )}

      {show("spa") && spa?.hasData && (
        <Section title={`${spa.property.spaName} — Spa & Wellness`}>
          {spa.segments.length > 0 && (
            <Table head={["Segment", "Covers", "Avg Check", "Rev Act", "Rev Bud", "Ach %"]} rows={spa.segments.map((s) => [SEG[s.segment] ?? s.segment, num(s.coversActual), money(s.avgCheckActual), money(s.revenueActual), money(s.revenueBudget), pct(achievementPct(s.revenueActual, s.revenueBudget))])} />
          )}
          {spa.treatments.length > 0 && (
            <Table head={["#", "Treatment", "Count", "Revenue", "Avg Price"]} rows={spa.treatments.map((t) => [t.rank, t.treatmentName, num(t.count), money(t.revenue), money(t.avgPrice)])} />
          )}
          <Prose text={spa.narrative?.content} />
        </Section>
      )}

      {show("market") && market && market.pace.length > 0 && (
        <Section title="Booking Pace & Forecast">
          <Table head={["Target Month", "Prev OTB", "OTB Today", "Pickup", "Market Demand", "Note"]} rows={market.pace.map((p) => [periodLabel(p.targetMonth), p.prevOcc != null ? p.prevOcc.toFixed(0) + "%" : "—", p.otbOcc.toFixed(0) + "%", p.pickup != null ? `${p.pickup >= 0 ? "+" : ""}${p.pickup.toFixed(1)} pts` : "—", p.marketDemand != null ? p.marketDemand.toFixed(0) + "%" : "—", p.note || "—"])} />
          {market.forecasts.length > 0 && (
            <Table head={["Month", "Forecast Occ", "Last Year", "Market Demand"]} rows={market.forecasts.map((f) => [periodLabel(f.month), f.forecastOcc != null ? f.forecastOcc.toFixed(1) + "%" : "—", f.lastYearOcc != null ? f.lastYearOcc.toFixed(1) + "%" : "—", f.marketDemand != null ? f.marketDemand.toFixed(1) + "%" : "—"])} />
          )}
          <Prose text={market.narrative?.content} />
        </Section>
      )}

      {show("plans") && plans && (
        <Section title="Action Plans, PR & Promotions">
          {([
            ["ACTION_PLAN", "Sales & Marketing Action Plan"],
            ["SALES_STRATEGY", "Sales Strategy per Segment"],
            ["MARKETING_PLAN", "Marketing Plan"],
            ["SOCIAL_PLAN", "Social Media Plan"],
            ["CONSORTIA", "Consortia & Partners"],
            ["MAGAZINE", "Magazine"],
            ["PR", "Media Features & PR"],
            ["PROMOTIONS", "Ongoing Promotions"],
          ] as [string, string][]).map(([id, label]) => (
            <div key={id}>
              <h3>{label}</h3>
              <Prose text={plans.sections[id]?.current?.content} />
            </div>
          ))}
        </Section>
      )}

      {show("social") && social && social.units.some((u) => u.hasData) && (
        <Section title="Social Media Reports">
          <Table
            head={["Unit · Platform", "Impr.", "Reach", "Interactions", "Followers"]}
            rows={social.units
              .filter((u) => u.hasData)
              .flatMap((u) =>
                u.platforms
                  .filter((p) => p.hasData)
                  .map((p) => {
                    const m = (k: string) => p.metrics.find((x) => x.key === k)?.value ?? null;
                    return [`${UNIT[u.unit] ?? u.unit} · ${p.platform}`, num(m("impressions")), num(m("reach")), num(m("interactions")), num(m("followersGained"))];
                  }),
              )}
          />
          {social.influencers.length > 0 && (
            <Table head={["Handle", "Name", "Followers", "Origin", "Notes"]} rows={social.influencers.map((i) => [i.handle, i.name, num(i.followers), i.origin, i.notes ?? "—"])} />
          )}
        </Section>
      )}
    </div>
  );
}

const PRINT_CSS = `
  .print-root { color: #1F2937; font-family: Inter, Calibri, Arial, sans-serif; max-width: 1040px; margin: 0 auto; padding: 24px; }
  .cover { text-align: left; padding: 60px 0 40px; border-bottom: 3px solid #C9A227; margin-bottom: 24px; }
  .cover .kicker { color: #C9A227; font-weight: 700; letter-spacing: 2px; font-size: 14px; margin: 0 0 8px; }
  .cover h1 { color: #0F4C5C; font-size: 40px; margin: 0 0 8px; }
  .cover .sub { font-size: 16px; margin: 0; }
  .cover .brand { color: #6B7280; font-size: 12px; margin-top: 24px; }
  .section { break-inside: avoid; margin: 0 0 22px; }
  h2 { color: #0F4C5C; font-size: 18px; border-bottom: 2px solid #0F4C5C; padding-bottom: 4px; margin: 18px 0 10px; }
  h3 { color: #0F4C5C; font-size: 13px; margin: 12px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 11px; }
  th { background: #0F4C5C; color: #fff; font-weight: 700; padding: 5px 8px; text-align: right; }
  th.l { text-align: left; }
  td { padding: 4px 8px; border-bottom: 1px solid #E5E7EB; text-align: right; }
  td.l { text-align: left; }
  p.prose { font-size: 12px; line-height: 1.5; margin: 4px 0; }
  p.muted { color: #6B7280; font-size: 11px; margin: 4px 0; }
  @media print {
    @page { size: A4 landscape; margin: 12mm; }
    .print-root { padding: 0; max-width: none; }
    .section { page-break-inside: avoid; }
  }
`;
