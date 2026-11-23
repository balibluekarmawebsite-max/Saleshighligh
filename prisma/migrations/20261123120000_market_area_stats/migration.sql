-- Booking.com "Market Area Update": the property's room nights & ADR vs the
-- overall market, one row per month on the Sales-statistics chart. The whole
-- monthly series belongs to the report period being edited (periodId).
CREATE TABLE "market_area_stats" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "statMonth" DATE NOT NULL,
    "propertyRoomNights" INTEGER NOT NULL,
    "marketRoomNights" INTEGER NOT NULL,
    "propertyAdr" DECIMAL(18,2) NOT NULL,
    "marketAdr" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "market_area_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "market_area_stats_periodId_statMonth_key" ON "market_area_stats"("periodId", "statMonth");

ALTER TABLE "market_area_stats"
  ADD CONSTRAINT "market_area_stats_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AI-written Booking.com Sales Performance summary for the Market Area Update.
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'MARKET_AREA_SUMMARY';
