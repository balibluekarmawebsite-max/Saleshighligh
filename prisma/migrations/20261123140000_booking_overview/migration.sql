-- Booking.com "Overview": the search -> property-page -> booking funnel and
-- search-availability, property vs market. One row per period, plus a monthly
-- availability trend.
CREATE TABLE "booking_overviews" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "dataAsOf" DATE,
    "searchResultsViews" INTEGER NOT NULL,
    "searchResultsViewsVsMkt" DECIMAL(14,4),
    "propertyPageVisits" INTEGER NOT NULL,
    "propertyPageVisitsVsMkt" DECIMAL(14,4),
    "bookingsMade" INTEGER NOT NULL,
    "bookingsMadeVsMkt" DECIMAL(14,4),
    "searchToPagePct" DECIMAL(9,4) NOT NULL,
    "searchToPageMarketPct" DECIMAL(9,4),
    "searchToPageVsMkt" DECIMAL(14,4),
    "pageToBookingPct" DECIMAL(9,4) NOT NULL,
    "pageToBookingMarketPct" DECIMAL(9,4),
    "pageToBookingVsMkt" DECIMAL(14,4),
    "availabilityPct" DECIMAL(9,4) NOT NULL,
    "availabilityVsMkt" DECIMAL(14,4),

    CONSTRAINT "booking_overviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_overviews_periodId_key" ON "booking_overviews"("periodId");

ALTER TABLE "booking_overviews"
  ADD CONSTRAINT "booking_overviews_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "booking_overview_avail" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "statMonth" DATE NOT NULL,
    "yourPct" DECIMAL(9,4) NOT NULL,
    "marketPct" DECIMAL(9,4) NOT NULL,

    CONSTRAINT "booking_overview_avail_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_overview_avail_periodId_statMonth_key" ON "booking_overview_avail"("periodId", "statMonth");

ALTER TABLE "booking_overview_avail"
  ADD CONSTRAINT "booking_overview_avail_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AI-written Booking.com Search Performance summary.
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'BOOKING_OVERVIEW_SUMMARY';
