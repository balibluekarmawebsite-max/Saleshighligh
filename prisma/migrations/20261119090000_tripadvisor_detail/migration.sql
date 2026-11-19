-- Extend tripadvisor_metrics with ranking, extra engagement metrics and the
-- Tripadvisor report's per-metric reported month-over-month %. All nullable so
-- existing (seeded HOTEL) rows are unaffected.
ALTER TABLE "tripadvisor_metrics"
  ADD COLUMN "rank" INTEGER,
  ADD COLUMN "totalInMarket" INTEGER,
  ADD COLUMN "qrReviews" INTEGER,
  ADD COLUMN "photoViews" INTEGER,
  ADD COLUMN "videoViews" INTEGER,
  ADD COLUMN "specialOfferClicks" INTEGER,
  ADD COLUMN "updateViews" INTEGER,
  ADD COLUMN "impressionsMom" DECIMAL(14,4),
  ADD COLUMN "pageVisitorsMom" DECIMAL(14,4),
  ADD COLUMN "photoViewsMom" DECIMAL(14,4),
  ADD COLUMN "videoViewsMom" DECIMAL(14,4),
  ADD COLUMN "specialOfferClicksMom" DECIMAL(14,4),
  ADD COLUMN "updateViewsMom" DECIMAL(14,4),
  ADD COLUMN "menuViewsMom" DECIMAL(14,4),
  ADD COLUMN "phoneCallsMom" DECIMAL(14,4),
  ADD COLUMN "websiteClicksMom" DECIMAL(14,4),
  ADD COLUMN "mapViewsMom" DECIMAL(14,4);

-- New narrative section for the AI-written Tripadvisor summary.
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'TRIPADVISOR_SUMMARY';
