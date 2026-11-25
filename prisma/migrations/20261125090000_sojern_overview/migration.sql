-- Sojern Market Overview: flight & hotel volume indices (% vs baseline) by
-- year/month, property's destination filter context. One metadata row per
-- period + many index points.
CREATE TABLE "sojern_overviews" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "originCountry" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "timePeriod" TEXT NOT NULL,
    "baselineLabel" TEXT NOT NULL,

    CONSTRAINT "sojern_overviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sojern_overviews_periodId_key" ON "sojern_overviews"("periodId");

ALTER TABLE "sojern_overviews"
  ADD CONSTRAINT "sojern_overviews_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sojern_index_points" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "valuePct" DECIMAL(9,4) NOT NULL,

    CONSTRAINT "sojern_index_points_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sojern_index_points_periodId_metric_year_month_key" ON "sojern_index_points"("periodId", "metric", "year", "month");

ALTER TABLE "sojern_index_points"
  ADD CONSTRAINT "sojern_index_points_periodId_fkey"
  FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AI-written Sojern market-demand summary.
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'SOJERN_SUMMARY';
