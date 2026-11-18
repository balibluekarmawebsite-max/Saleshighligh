-- Extend the Chope report with the full traffic funnel, source covers and the
-- given revenue %, add a daily online-bookings table, and a CHOPE_SUMMARY
-- narrative section.

-- 1. New ChopeReport columns (defaults keep existing rows valid).
ALTER TABLE "chope_reports" ADD COLUMN "noShowCovers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "chope_reports" ADD COLUMN "upcomingBookings" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "chope_reports" ADD COLUMN "upcomingCovers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "chope_reports" ADD COLUMN "walkinBookings" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "chope_reports" ADD COLUMN "walkinCovers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "chope_reports" ADD COLUMN "revenuePct" DECIMAL(7,4);
ALTER TABLE "chope_reports" ADD COLUMN "platformCovers" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "chope_reports" ADD COLUMN "directCovers" INTEGER NOT NULL DEFAULT 0;

-- 2. Daily online bookings by source.
CREATE TABLE "chope_daily" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "platformBookings" INTEGER NOT NULL,
    "directBookings" INTEGER NOT NULL,

    CONSTRAINT "chope_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "chope_daily_periodId_day_key" ON "chope_daily"("periodId", "day");

ALTER TABLE "chope_daily"
    ADD CONSTRAINT "chope_daily_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. New narrative section for the editable Chope summary.
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'CHOPE_SUMMARY';
