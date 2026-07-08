-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "Scope" AS ENUM ('MTD', 'YTD');

-- CreateEnum
CREATE TYPE "Series" AS ENUM ('ACTUAL', 'BUDGET', 'LAST_YEAR');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('OCCUPANCY', 'ADR', 'REVPAR', 'ROOM_REVENUE', 'FNB', 'SPA_WELLNESS', 'GALLERY', 'OOD', 'TOTAL_REVENUE');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('OTA', 'TA', 'CORPORATE', 'WHOLESALER');

-- CreateEnum
CREATE TYPE "BusinessUnit" AS ENUM ('HOTEL', 'RESTAURANT', 'SPA');

-- CreateEnum
CREATE TYPE "AdsPlatform" AS ENUM ('GOOGLE', 'META', 'CORPORATE');

-- CreateEnum
CREATE TYPE "MealPeriod" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER');

-- CreateEnum
CREATE TYPE "FnbChannel" AS ENUM ('WALK_IN', 'REPEATER', 'CHOPE', 'CATERING');

-- CreateEnum
CREATE TYPE "SpaGuestSegment" AS ENUM ('IN_HOUSE', 'OUTSIDE', 'INCLUSION');

-- CreateEnum
CREATE TYPE "RankingPlatform" AS ENUM ('BOOKING', 'EXPEDIA', 'TRIPADVISOR');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'FACEBOOK', 'TIKTOK', 'YOUTUBE');

-- CreateEnum
CREATE TYPE "NarrativeSection" AS ENUM ('SUMMARY', 'EXTERNAL_FACTORS', 'INTERNAL_FACTORS', 'ROOMTYPE_ANALYSIS', 'RESTAURANT_OVERVIEW', 'SPA_OVERVIEW', 'ACTION_PLAN', 'MARKETING_PLAN', 'SOCIAL_PLAN', 'CONSORTIA', 'MAGAZINE', 'PR', 'PROMOTIONS');

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "spaName" TEXT NOT NULL,
    "roomCount" INTEGER NOT NULL,
    "area" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_periods" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_summaries" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "department" "Department" NOT NULL,
    "actual" DECIMAL(18,2) NOT NULL,
    "budget" DECIMAL(18,2) NOT NULL,
    "lastYear" DECIMAL(18,2),

    CONSTRAINT "revenue_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_production" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "segmentName" TEXT NOT NULL,
    "roomNights" INTEGER NOT NULL,
    "arr" DECIMAL(18,2) NOT NULL,
    "roomRevenue" DECIMAL(18,2) NOT NULL,
    "series" "Series" NOT NULL,

    CONSTRAINT "segment_production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_type_production" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "roomTypeName" TEXT NOT NULL,
    "roomNightsActual" INTEGER NOT NULL,
    "roomNightsBudget" INTEGER NOT NULL,
    "adrActual" DECIMAL(18,2) NOT NULL,
    "adrBudget" DECIMAL(18,2) NOT NULL,
    "revenueActual" DECIMAL(18,2) NOT NULL,
    "revenueBudget" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "room_type_production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nationality_production" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "scope" "Scope" NOT NULL,
    "countryCode" TEXT,
    "countryName" TEXT NOT NULL,
    "roomNights" INTEGER NOT NULL,
    "guests" INTEGER,
    "roomNightsLastYear" INTEGER,

    CONSTRAINT "nationality_production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "length_of_stay" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "losBucket" TEXT NOT NULL,
    "bookings" INTEGER NOT NULL,
    "roomNights" INTEGER NOT NULL,
    "lastYearRoomNights" INTEGER,

    CONSTRAINT "length_of_stay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_production" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "roomNights" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "account_production_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads_performance" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "unit" "BusinessUnit" NOT NULL,
    "platform" "AdsPlatform" NOT NULL,
    "spend" DECIMAL(18,2) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "reach" INTEGER,
    "trackedRevenue" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ads_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fnb_sales" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "mealPeriod" "MealPeriod" NOT NULL,
    "coversActual" INTEGER NOT NULL,
    "coversBudget" INTEGER NOT NULL,
    "revenueActual" DECIMAL(18,2) NOT NULL,
    "revenueBudget" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "fnb_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fnb_source_of_booking" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "persons" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "fnb_source_of_booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fnb_acquisition" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "channel" "FnbChannel" NOT NULL,
    "bookingsPct" DECIMAL(9,4) NOT NULL,
    "coversPct" DECIMAL(9,4) NOT NULL,

    CONSTRAINT "fnb_acquisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chope_reports" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "fulfilledBookings" INTEGER NOT NULL,
    "fulfilledCovers" INTEGER NOT NULL,
    "cancelledBookings" INTEGER NOT NULL,
    "cancelledCovers" INTEGER NOT NULL,
    "noShows" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2) NOT NULL,
    "platformBookings" INTEGER NOT NULL,
    "directBookings" INTEGER NOT NULL,

    CONSTRAINT "chope_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gokai_reports" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "unit" "BusinessUnit" NOT NULL,
    "signups" INTEGER NOT NULL,
    "openRatePct" DECIMAL(9,4) NOT NULL,
    "ctrPct" DECIMAL(9,4) NOT NULL,
    "surveyCompletionPct" DECIMAL(9,4) NOT NULL,
    "productViews" INTEGER NOT NULL,
    "upsellSales" INTEGER NOT NULL,
    "upsellRevenue" DECIMAL(18,2) NOT NULL,
    "refunds" INTEGER NOT NULL,

    CONSTRAINT "gokai_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spa_sales" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "guestSegment" "SpaGuestSegment" NOT NULL,
    "coversActual" INTEGER NOT NULL,
    "coversBudget" INTEGER NOT NULL,
    "revenueActual" DECIMAL(18,2) NOT NULL,
    "revenueBudget" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "spa_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spa_treatments" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "treatmentName" TEXT NOT NULL,
    "treatmentCount" INTEGER NOT NULL,
    "revenue" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "spa_treatments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_rankings" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "platform" "RankingPlatform" NOT NULL,
    "rank" INTEGER NOT NULL,
    "totalInMarket" INTEGER,
    "rating" DECIMAL(3,2),

    CONSTRAINT "platform_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tripadvisor_metrics" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "unit" "BusinessUnit" NOT NULL,
    "impressions" INTEGER NOT NULL,
    "pageVisitors" INTEGER NOT NULL,
    "newReviews" INTEGER NOT NULL,
    "avgRating" DECIMAL(3,2) NOT NULL,
    "websiteClicks" INTEGER NOT NULL,
    "phoneCalls" INTEGER NOT NULL,
    "menuViews" INTEGER,
    "mapViews" INTEGER NOT NULL,

    CONSTRAINT "tripadvisor_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_media_metrics" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "unit" "BusinessUnit" NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "impressions" INTEGER NOT NULL,
    "reach" INTEGER NOT NULL,
    "interactions" INTEGER NOT NULL,
    "linkClicks" INTEGER NOT NULL,
    "profileVisits" INTEGER NOT NULL,
    "followersGained" INTEGER NOT NULL,

    CONSTRAINT "social_media_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_pace" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "targetMonth" DATE NOT NULL,
    "occupancyOnBooks" DECIMAL(9,4) NOT NULL,
    "previousSnapshotOcc" DECIMAL(9,4),
    "marketDemandPct" DECIMAL(9,4),
    "note" TEXT NOT NULL,

    CONSTRAINT "booking_pace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecasts" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "targetMonth" DATE NOT NULL,
    "forecastOccPct" DECIMAL(9,4) NOT NULL,
    "lastYearOccPct" DECIMAL(9,4),
    "marketDemandPct" DECIMAL(9,4),
    "forecastRevenue" DECIMAL(18,2),
    "budgetRevenue" DECIMAL(18,2),

    CONSTRAINT "forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "narrative_content" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "section" "NarrativeSection" NOT NULL,
    "content" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "narrative_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "influencer_collabs" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "followers" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "influencer_collabs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "properties_code_key" ON "properties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "report_periods_propertyId_period_key" ON "report_periods"("propertyId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_summaries_periodId_department_key" ON "revenue_summaries"("periodId", "department");

-- CreateIndex
CREATE UNIQUE INDEX "segment_production_periodId_scope_segmentName_series_key" ON "segment_production"("periodId", "scope", "segmentName", "series");

-- CreateIndex
CREATE UNIQUE INDEX "room_type_production_periodId_roomTypeName_key" ON "room_type_production"("periodId", "roomTypeName");

-- CreateIndex
CREATE UNIQUE INDEX "nationality_production_periodId_scope_countryName_key" ON "nationality_production"("periodId", "scope", "countryName");

-- CreateIndex
CREATE UNIQUE INDEX "length_of_stay_periodId_losBucket_key" ON "length_of_stay"("periodId", "losBucket");

-- CreateIndex
CREATE UNIQUE INDEX "account_production_periodId_accountName_key" ON "account_production"("periodId", "accountName");

-- CreateIndex
CREATE UNIQUE INDEX "ads_performance_periodId_unit_platform_key" ON "ads_performance"("periodId", "unit", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "fnb_sales_periodId_mealPeriod_key" ON "fnb_sales"("periodId", "mealPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "fnb_source_of_booking_periodId_sourceName_key" ON "fnb_source_of_booking"("periodId", "sourceName");

-- CreateIndex
CREATE UNIQUE INDEX "fnb_acquisition_periodId_channel_key" ON "fnb_acquisition"("periodId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "chope_reports_periodId_key" ON "chope_reports"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "gokai_reports_periodId_unit_key" ON "gokai_reports"("periodId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "spa_sales_periodId_guestSegment_key" ON "spa_sales"("periodId", "guestSegment");

-- CreateIndex
CREATE UNIQUE INDEX "spa_treatments_periodId_treatmentName_key" ON "spa_treatments"("periodId", "treatmentName");

-- CreateIndex
CREATE UNIQUE INDEX "platform_rankings_periodId_platform_key" ON "platform_rankings"("periodId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "tripadvisor_metrics_periodId_unit_key" ON "tripadvisor_metrics"("periodId", "unit");

-- CreateIndex
CREATE UNIQUE INDEX "social_media_metrics_periodId_unit_platform_key" ON "social_media_metrics"("periodId", "unit", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "booking_pace_periodId_targetMonth_snapshotDate_key" ON "booking_pace"("periodId", "targetMonth", "snapshotDate");

-- CreateIndex
CREATE UNIQUE INDEX "forecasts_periodId_targetMonth_key" ON "forecasts"("periodId", "targetMonth");

-- CreateIndex
CREATE UNIQUE INDEX "narrative_content_periodId_section_key" ON "narrative_content"("periodId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "influencer_collabs_periodId_handle_key" ON "influencer_collabs"("periodId", "handle");

-- AddForeignKey
ALTER TABLE "report_periods" ADD CONSTRAINT "report_periods_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_summaries" ADD CONSTRAINT "revenue_summaries_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_production" ADD CONSTRAINT "segment_production_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_type_production" ADD CONSTRAINT "room_type_production_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nationality_production" ADD CONSTRAINT "nationality_production_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "length_of_stay" ADD CONSTRAINT "length_of_stay_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_production" ADD CONSTRAINT "account_production_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads_performance" ADD CONSTRAINT "ads_performance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fnb_sales" ADD CONSTRAINT "fnb_sales_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fnb_source_of_booking" ADD CONSTRAINT "fnb_source_of_booking_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fnb_acquisition" ADD CONSTRAINT "fnb_acquisition_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chope_reports" ADD CONSTRAINT "chope_reports_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gokai_reports" ADD CONSTRAINT "gokai_reports_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spa_sales" ADD CONSTRAINT "spa_sales_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spa_treatments" ADD CONSTRAINT "spa_treatments_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_rankings" ADD CONSTRAINT "platform_rankings_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tripadvisor_metrics" ADD CONSTRAINT "tripadvisor_metrics_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_media_metrics" ADD CONSTRAINT "social_media_metrics_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_pace" ADD CONSTRAINT "booking_pace_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecasts" ADD CONSTRAINT "forecasts_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "narrative_content" ADD CONSTRAINT "narrative_content_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "influencer_collabs" ADD CONSTRAINT "influencer_collabs_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

