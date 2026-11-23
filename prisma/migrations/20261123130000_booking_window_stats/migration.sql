-- Booking.com "Booking Window": reservation share and ADR by booking lead-time
-- bucket, property vs market. One row per bucket; report-level metadata (window
-- label, data-as-of, total booked rooms) is repeated on each row.
CREATE TABLE "booking_window_stats" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "propertySharePct" DECIMAL(9,4) NOT NULL,
    "marketSharePct" DECIMAL(9,4) NOT NULL,
    "propertyAdr" DECIMAL(18,2) NOT NULL,
    "marketAdr" DECIMAL(18,2) NOT NULL,
    "windowLabel" TEXT NOT NULL,
    "dataAsOf" DATE,
    "totalBookedRooms" INTEGER NOT NULL,

    CONSTRAINT "booking_window_stats_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "booking_window_stats_periodId_bucket_key" ON "booking_window_stats"("periodId", "bucket");

ALTER TABLE "booking_window_stats"
  ADD CONSTRAINT "booking_window_stats_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AI-written Booking Window analysis summary.
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'BOOKING_WINDOW_SUMMARY';
