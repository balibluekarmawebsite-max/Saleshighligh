-- Headline ads ROAS uses BOOKED revenue (matching the ads dashboard), stored
-- alongside the per-platform conversion value. Nullable for legacy imports.
ALTER TABLE "ads_performance" ADD COLUMN "bookedRevenue" DECIMAL(18,2);
