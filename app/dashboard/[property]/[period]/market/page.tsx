import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";

import { AvailabilityTrendChart } from "@/components/charts/availability-trend-chart";
import { BookingWindowChart } from "@/components/charts/booking-window-chart";
import { ForecastOccupancyChart } from "@/components/charts/forecast-occupancy-chart";
import { MarketAreaChart } from "@/components/charts/market-area-chart";
import { MarketPaceChart } from "@/components/charts/market-pace-chart";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { MoMBadge } from "@/components/dashboard/mom-badge";
import { NarrativePanel } from "@/components/dashboard/narrative-panel";
import { SectionCard } from "@/components/dashboard/section-card";
import { Sparkline } from "@/components/dashboard/sparkline";
import { StatTile } from "@/components/dashboard/stat-tile";
import { BookingOverviewUploader } from "@/components/sales/booking-overview-uploader";
import { BookingWindowUploader } from "@/components/sales/booking-window-uploader";
import { MarketAreaUploader } from "@/components/sales/market-area-uploader";
import { Card, CardContent } from "@/components/ui/card";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { GROUP_CODE, getMarketPageData } from "@/lib/dashboard-data";
import { formatIDR, formatNumber, varianceColorClass } from "@/lib/format";
import { periodLabel, periodMonthShort } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function SectionNote({ title, description, message }: { title: string; description?: string; message: string }) {
  return (
    <SectionCard title={title} description={description}>
      <p className="text-sm text-muted-foreground">{message}</p>
    </SectionCard>
  );
}

function signedIDR(value: number): string {
  return `${value > 0 ? "+" : ""}${formatIDR(value)}`;
}

export default async function MarketPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Market & Forecast" description="Consolidated view coming soon." />;
  }

  const me = await getCurrentUser();
  const canEdit = canEditProperty(me, params.property);
  const data = await getMarketPageData(params.property, params.period);
  if (!data) notFound();
  if (!data.hasData) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook (PACE / FORECAST / MARKET tabs) to populate this page."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const { property, pace, paceAsOf, forecasts, revenueForecast, revenueForecastCumulativeGap, supply, demandRange, marketArea, bookingWindow, bookingOverview, narrative, marketAreaNarrative, bookingWindowNarrative, bookingOverviewNarrative, alerts } = data;
  const fileBase = `${property.code}-${params.period}-market`;

  const availTrendData = (bookingOverview?.availability ?? []).map((a) => ({
    month: a.monthLabel,
    yourPct: a.yourPct,
    marketPct: a.marketPct,
  }));

  const bookingWindowChartData = (bookingWindow?.buckets ?? []).map((b) => ({
    bucket: b.bucket,
    propertyShare: b.propertySharePct,
    marketShare: b.marketSharePct,
    propertyAdr: b.propertyAdr,
    marketAdr: b.marketAdr,
  }));

  const paceChartData = pace.map((p) => ({ month: p.monthLabel, otb: p.otbOcc, demand: p.marketDemand, pickup: p.pickup }));
  const marketAreaChartData = marketArea.map((m) => ({
    month: m.monthLabel,
    propertyRN: m.propertyRoomNights,
    marketRN: m.marketRoomNights,
    propertyAdr: m.propertyAdr,
    marketAdr: m.marketAdr,
  }));
  const forecastChartData = forecasts.map((f) => ({
    month: periodMonthShort(f.month),
    forecast: f.forecastOcc,
    lastYear: f.lastYearOcc,
    marketDemand: f.marketDemand,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{property.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Market Intelligence &amp; Forecast · {periodLabel(params.period)}
        </p>
      </div>

      {/* Alert strip */}
      {alerts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {alerts.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {a.message}
            </span>
          ))}
        </div>
      )}

      {/* 1 — Booking pace / on the books */}
      {pace.length > 0 ? (
        <div className="space-y-6">
          <SectionCard
            title="On the Books"
            description={paceAsOf ? `Data as of ${dateFmt.format(new Date(paceAsOf))}` : "Booking pace by target month"}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                    <th className="px-3 py-2 text-left">Target Month</th>
                    <th className="px-3 py-2 text-right">Prev OTB</th>
                    <th className="px-3 py-2 text-right">OTB Today</th>
                    <th className="px-3 py-2 text-right">Pickup</th>
                    <th className="px-3 py-2 text-right">Market Demand</th>
                    <th className="px-3 py-2 text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {pace.map((p) => (
                    <tr key={p.targetMonth} className="border-b border-border/60">
                      <td className="px-3 py-2 font-medium text-foreground">{periodLabel(p.targetMonth)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{p.prevOcc !== null ? `${p.prevOcc.toFixed(0)}%` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{p.otbOcc.toFixed(0)}%</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end">
                          <MoMBadge value={p.pickup} unit="pts" />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-foreground">{p.marketDemand !== null ? `${p.marketDemand.toFixed(0)}%` : "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{p.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <ExportableCard
            title="Booking Pace — Next 6 Months"
            description="Bars = on the books · dashed line = market demand"
            fileName={`${fileBase}-pace`}
          >
            <MarketPaceChart data={paceChartData} />
          </ExportableCard>
        </div>
      ) : (
        <SectionNote title="On the Books" description="Booking pace by target month" message="No booking-pace data for this period yet." />
      )}

      {/* 2 — 6-month forecast */}
      {forecasts.length > 0 ? (
        <ExportableCard
          title="6-Month Forecast — Occupancy"
          description="Forecast vs last year vs market demand"
          fileName={`${fileBase}-forecast-occ`}
        >
          <ForecastOccupancyChart data={forecastChartData} />
        </ExportableCard>
      ) : (
        <SectionNote title="6-Month Forecast" description="Forward occupancy outlook" message="No forecast data for this period yet." />
      )}

      {revenueForecast.length > 0 && (
        <ExportableCard title="Revenue Forecast vs Budget" description="Monthly gap and cumulative gap" fileName={`${fileBase}-forecast-rev`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-right">Forecast</th>
                  <th className="px-3 py-2 text-right">Budget</th>
                  <th className="px-3 py-2 text-right">Gap</th>
                  <th className="px-3 py-2 text-right">Cumulative Gap</th>
                </tr>
              </thead>
              <tbody>
                {revenueForecast.map((r) => (
                  <tr key={r.month} className="border-b border-border/60">
                    <td className="px-3 py-2 font-medium text-foreground">{periodLabel(r.month)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{r.forecastRevenue !== null ? formatIDR(r.forecastRevenue) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{r.budgetRevenue !== null ? formatIDR(r.budgetRevenue) : "—"}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", varianceColorClass(r.gap))}>{r.gap !== null ? signedIDR(r.gap) : "—"}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", varianceColorClass(r.cumulativeGap))}>{r.cumulativeGap !== null ? signedIDR(r.cumulativeGap) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-3 py-2 text-foreground" colSpan={3}>Cumulative gap</td>
                  <td className="px-3 py-2" />
                  <td className={cn("px-3 py-2 text-right tabular-nums", varianceColorClass(revenueForecastCumulativeGap))}>
                    {revenueForecastCumulativeGap !== null ? signedIDR(revenueForecastCumulativeGap) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </ExportableCard>
      )}

      {/* 3 — Market supply & demand context */}
      <SectionCard title="Market Supply & Demand" description="Competitive supply and demand context for the area">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {supply.map((s) => (
            <div key={s.areaName} className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-muted-foreground">{s.areaName}</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <p className="text-2xl font-semibold tracking-tight text-foreground">{formatNumber(s.propertiesCount)}</p>
                {s.trend.length > 1 && <Sparkline data={s.trend} />}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs">
                {s.yoyPct !== null ? <MoMBadge value={s.yoyPct} /> : <span className="text-muted-foreground">no prior year</span>}
                <span className="text-muted-foreground">YoY · properties</span>
              </div>
            </div>
          ))}

          <div className="rounded-lg border border-border p-4">
            <p className="text-sm font-medium text-muted-foreground">Market Demand Range</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
              {demandRange ? `${demandRange.min.toFixed(0)}–${demandRange.max.toFixed(0)}%` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">across the forecast window</p>
          </div>
        </div>
      </SectionCard>

      {/* 3b — Booking.com Overview (search performance funnel) */}
      <div className="space-y-4">
        {canEdit && (
          <BookingOverviewUploader
            property={params.property}
            period={params.period}
            initial={bookingOverview}
            hasData={bookingOverview !== null}
          />
        )}
        {bookingOverview ? (
          <>
            <SectionCard
              title="Booking.com Overview"
              description={`How searches turn into bookings vs market (${bookingOverview.windowLabel})${bookingOverview.dataAsOf ? ` · data as of ${dateFmt.format(new Date(bookingOverview.dataAsOf))}` : ""}`}
            >
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatTile
                  label="Search results views"
                  value={formatNumber(bookingOverview.searchResultsViews)}
                  sub={bookingOverview.searchResultsViewsVsMkt !== null ? <MoMBadge value={bookingOverview.searchResultsViewsVsMkt} /> : "vs market n/a"}
                />
                <StatTile
                  label="Property page visits"
                  value={formatNumber(bookingOverview.propertyPageVisits)}
                  sub={bookingOverview.propertyPageVisitsVsMkt !== null ? <MoMBadge value={bookingOverview.propertyPageVisitsVsMkt} /> : "vs market n/a"}
                />
                <StatTile
                  label="Bookings made"
                  value={formatNumber(bookingOverview.bookingsMade)}
                  sub={bookingOverview.bookingsMadeVsMkt !== null ? <MoMBadge value={bookingOverview.bookingsMadeVsMkt} /> : "vs market n/a"}
                />
                <StatTile
                  label="Search-to-page conversion"
                  value={`${bookingOverview.searchToPagePct.toFixed(2)}%`}
                  sub={
                    <span className="inline-flex items-center gap-1.5">
                      {bookingOverview.searchToPageVsMkt !== null && <MoMBadge value={bookingOverview.searchToPageVsMkt} />}
                      {bookingOverview.searchToPageMarketPct !== null && <span className="text-muted-foreground">mkt {bookingOverview.searchToPageMarketPct.toFixed(2)}%</span>}
                    </span>
                  }
                />
                <StatTile
                  label="Page-to-booking conversion"
                  value={`${bookingOverview.pageToBookingPct.toFixed(2)}%`}
                  sub={
                    <span className="inline-flex items-center gap-1.5">
                      {bookingOverview.pageToBookingVsMkt !== null && <MoMBadge value={bookingOverview.pageToBookingVsMkt} />}
                      {bookingOverview.pageToBookingMarketPct !== null && <span className="text-muted-foreground">mkt {bookingOverview.pageToBookingMarketPct.toFixed(2)}%</span>}
                    </span>
                  }
                />
                <StatTile
                  label="Availability for search"
                  value={`${bookingOverview.availabilityPct.toFixed(2)}%`}
                  sub={bookingOverview.availabilityVsMkt !== null ? <MoMBadge value={bookingOverview.availabilityVsMkt} /> : "vs market n/a"}
                />
              </div>
            </SectionCard>
            {availTrendData.length > 1 && (
              <ExportableCard
                title="Availability for Search — Trend"
                description="Your availability vs market, monthly"
                fileName={`${fileBase}-availability`}
              >
                <AvailabilityTrendChart data={availTrendData} />
              </ExportableCard>
            )}
          </>
        ) : (
          <SectionNote
            title="Booking.com Overview"
            description="Booking.com search performance, property vs market"
            message={
              canEdit
                ? "No Booking.com Overview yet — attach the search-performance screenshots above to compile it."
                : "No Booking.com Overview for this period yet."
            }
          />
        )}

        {/* Booking.com search performance summary */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">Booking.com Search Performance Summary</h3>
              <p className="mt-1 text-sm text-muted-foreground">Overall search performance, key insights and the summary.</p>
            </div>
            <NarrativePanel
              block={bookingOverviewNarrative}
              section="BOOKING_OVERVIEW_SUMMARY"
              property={params.property}
              period={params.period}
              emptyText="No Booking.com search performance summary written for this period yet."
            />
          </CardContent>
        </Card>
      </div>

      {/* 4 — Market Area Update (Booking.com property vs market) */}
      <div className="space-y-4">
        {canEdit && (
          <MarketAreaUploader
            property={params.property}
            period={params.period}
            initial={marketArea}
            hasData={marketArea.length > 0}
          />
        )}
        {marketArea.length > 0 ? (
          <ExportableCard
            title="Market Area Update"
            description="Booking.com — property vs market: room nights (bars) and average daily rate (lines)"
            fileName={`${fileBase}-area`}
          >
            <MarketAreaChart data={marketAreaChartData} />
          </ExportableCard>
        ) : (
          <SectionNote
            title="Market Area Update"
            description="Booking.com — property vs market room nights &amp; ADR"
            message={
              canEdit
                ? "No Market Area data yet — attach the Booking.com sales-statistics chart above to compile it."
                : "No Market Area data for this period yet."
            }
          />
        )}

        {/* Booking.com sales performance summary */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">Booking.com Sales Performance Summary</h3>
              <p className="mt-1 text-sm text-muted-foreground">Room nights, ADR and the property-vs-market story.</p>
            </div>
            <NarrativePanel
              block={marketAreaNarrative}
              section="MARKET_AREA_SUMMARY"
              property={params.property}
              period={params.period}
              emptyText="No Booking.com sales performance summary written for this period yet."
            />
          </CardContent>
        </Card>
      </div>

      {/* 5 — Booking Window (Booking.com lead-time) */}
      <div className="space-y-4">
        {canEdit && (
          <BookingWindowUploader
            property={params.property}
            period={params.period}
            initial={bookingWindow}
            hasData={bookingWindow !== null}
          />
        )}
        {bookingWindow && bookingWindow.buckets.length > 0 ? (
          <ExportableCard
            title="Booking Window"
            description={`Booking.com — reservations per book window (${bookingWindow.windowLabel}); property vs market${bookingWindow.dataAsOf ? ` · data as of ${dateFmt.format(new Date(bookingWindow.dataAsOf))}` : ""}${bookingWindow.totalBookedRooms ? ` · ${formatNumber(bookingWindow.totalBookedRooms)} booked rooms` : ""}`}
            fileName={`${fileBase}-booking-window`}
          >
            <BookingWindowChart data={bookingWindowChartData} />
          </ExportableCard>
        ) : (
          <SectionNote
            title="Booking Window"
            description="Booking.com — reservations per book window, property vs market"
            message={
              canEdit
                ? "No Booking Window data yet — attach the Booking.com book-window chart above to compile it."
                : "No Booking Window data for this period yet."
            }
          />
        )}

        {/* Booking Window analysis summary */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">Booking Window Analysis Summary</h3>
              <p className="mt-1 text-sm text-muted-foreground">Booking pattern, rate positioning and the key takeaways.</p>
            </div>
            <NarrativePanel
              block={bookingWindowNarrative}
              section="BOOKING_WINDOW_SUMMARY"
              property={params.property}
              period={params.period}
              emptyText="No Booking Window analysis written for this period yet."
            />
          </CardContent>
        </Card>
      </div>

      {/* Market-area commentary (competitor behaviour) */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Market-Area Commentary</h3>
            <p className="mt-1 text-sm text-muted-foreground">Competitor behaviour and market-area commentary.</p>
          </div>
          <NarrativePanel
            block={narrative}
            section="MARKET_INTEL"
            property={params.property}
            period={params.period}
            emptyText="No market-area commentary written for this period yet."
          />
        </CardContent>
      </Card>
    </div>
  );
}
