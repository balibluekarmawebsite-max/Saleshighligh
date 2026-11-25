import { notFound } from "next/navigation";

import { AvailabilityTrendChart } from "@/components/charts/availability-trend-chart";
import { BookingWindowChart } from "@/components/charts/booking-window-chart";
import { MarketAreaChart } from "@/components/charts/market-area-chart";
import { SojernIndexChart } from "@/components/charts/sojern-index-chart";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { MoMBadge } from "@/components/dashboard/mom-badge";
import { NarrativePanel } from "@/components/dashboard/narrative-panel";
import { SectionCard } from "@/components/dashboard/section-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { BookingOverviewUploader } from "@/components/sales/booking-overview-uploader";
import { BookingWindowUploader } from "@/components/sales/booking-window-uploader";
import { MarketAreaUploader } from "@/components/sales/market-area-uploader";
import { SojernUploader } from "@/components/sales/sojern-uploader";
import { Card, CardContent } from "@/components/ui/card";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { GROUP_CODE, getMarketPageData } from "@/lib/dashboard-data";
import { formatNumber } from "@/lib/format";
import { periodLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function SectionNote({ title, description, message }: { title: string; description?: string; message: string }) {
  return (
    <SectionCard title={title} description={description}>
      <p className="text-sm text-muted-foreground">{message}</p>
    </SectionCard>
  );
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
        message="Upload the Sojern and Booking.com market data below to populate this page."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const { property, marketArea, bookingWindow, bookingOverview, sojern, marketAreaNarrative, bookingWindowNarrative, bookingOverviewNarrative, sojernNarrative } = data;
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

  const marketAreaChartData = marketArea.map((m) => ({
    month: m.monthLabel,
    propertyRN: m.propertyRoomNights,
    marketRN: m.marketRoomNights,
    propertyAdr: m.propertyAdr,
    marketAdr: m.marketAdr,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{property.name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Market Intelligence &amp; Forecast · {periodLabel(params.period)}
        </p>
      </div>

      {/* 1 — Sojern Market Overview (flight & hotel travel demand) */}
      <div className="space-y-4">
        {canEdit && (
          <SojernUploader
            property={params.property}
            period={params.period}
            initial={sojern}
            hasData={sojern !== null}
          />
        )}
        {sojern && sojern.years.length > 0 ? (
          <>
            <p className="text-xs text-muted-foreground">
              Sojern travel demand · Destination: <span className="font-medium text-foreground">{sojern.destination}</span>
              {" · "}Origin: {sojern.originCountry} · Event: {sojern.eventType} · {sojern.timePeriod}
            </p>
            <ExportableCard
              title={`Flight Volume Index (vs ${sojern.baselineLabel} Baseline)`}
              description="% difference vs the baseline month, one line per year"
              fileName={`${fileBase}-sojern-flight`}
            >
              <SojernIndexChart years={sojern.years} data={sojern.flight} />
            </ExportableCard>
            <ExportableCard
              title={`Hotel Volume Index (vs ${sojern.baselineLabel} Baseline)`}
              description="% difference vs the baseline month, one line per year"
              fileName={`${fileBase}-sojern-hotel`}
            >
              <SojernIndexChart years={sojern.years} data={sojern.hotel} />
            </ExportableCard>
          </>
        ) : (
          <SectionNote
            title="Sojern Market Overview"
            description="Flight & hotel travel demand to the destination"
            message={
              canEdit
                ? "No Sojern data yet — attach the Sojern flight & hotel volume index charts above to compile it."
                : "No Sojern data for this period yet."
            }
          />
        )}

        {/* Sojern market demand summary */}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">Sojern Market Demand Summary</h3>
              <p className="mt-1 text-sm text-muted-foreground">Flight &amp; hotel demand trends and the key insights.</p>
            </div>
            <NarrativePanel
              block={sojernNarrative}
              section="SOJERN_SUMMARY"
              property={params.property}
              period={params.period}
              emptyText="No Sojern market demand summary written for this period yet."
            />
          </CardContent>
        </Card>
      </div>

      {/* 2 — Booking.com Overview (search performance funnel) */}
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

      {/* 3 — Market Area Update (Booking.com property vs market) */}
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

      {/* 4 — Booking Window (Booking.com lead-time) */}
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
    </div>
  );
}
