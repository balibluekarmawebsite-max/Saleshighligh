-- Add the Gokai dashboard's reported month-over-month % per metric (nullable),
-- and a GOKAI_SUMMARY narrative section.

ALTER TABLE "gokai_reports" ADD COLUMN "signupsMom" DECIMAL(14,4);
ALTER TABLE "gokai_reports" ADD COLUMN "openRateMom" DECIMAL(14,4);
ALTER TABLE "gokai_reports" ADD COLUMN "ctrMom" DECIMAL(14,4);
ALTER TABLE "gokai_reports" ADD COLUMN "surveyMom" DECIMAL(14,4);
ALTER TABLE "gokai_reports" ADD COLUMN "upsellSalesMom" DECIMAL(14,4);
ALTER TABLE "gokai_reports" ADD COLUMN "upsellRevenueMom" DECIMAL(14,4);

ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'GOKAI_SUMMARY';
