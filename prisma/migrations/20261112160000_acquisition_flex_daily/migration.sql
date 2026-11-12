-- Acquisition channels become free text (any channel set per month),
-- add a daily Cover-vs-Booking table, and a new ACQUISITION_SPLIT narrative.

-- 1. fnb_acquisition.channel: enum FnbChannel -> free text.
ALTER TABLE "fnb_acquisition" ALTER COLUMN "channel" TYPE TEXT USING "channel"::text;

-- The FnbChannel enum type is now unused.
DROP TYPE IF EXISTS "FnbChannel";

-- 2. Daily bookings vs covers (the "Cover vs Booking" chart).
CREATE TABLE "fnb_acquisition_daily" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "bookings" INTEGER NOT NULL,
    "covers" INTEGER NOT NULL,

    CONSTRAINT "fnb_acquisition_daily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "fnb_acquisition_daily_periodId_day_key" ON "fnb_acquisition_daily"("periodId", "day");

ALTER TABLE "fnb_acquisition_daily"
    ADD CONSTRAINT "fnb_acquisition_daily_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. New narrative section for the editable acquisition summary.
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'ACQUISITION_SPLIT';
