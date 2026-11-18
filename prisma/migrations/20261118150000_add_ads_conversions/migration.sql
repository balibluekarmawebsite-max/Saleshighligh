-- Add ad-reported conversions to monthly ads performance (matches the ads
-- dashboard's "conversions" headline). Nullable so legacy imports are unaffected.
ALTER TABLE "ads_performance" ADD COLUMN "conversions" INTEGER;
