-- Widen revenue_summaries numeric columns to 4 dp so ratios (occupancy) render precisely.
ALTER TABLE "revenue_summaries" ALTER COLUMN "actual" SET DATA TYPE DECIMAL(18,4);
ALTER TABLE "revenue_summaries" ALTER COLUMN "budget" SET DATA TYPE DECIMAL(18,4);
ALTER TABLE "revenue_summaries" ALTER COLUMN "lastYear" SET DATA TYPE DECIMAL(18,4);
