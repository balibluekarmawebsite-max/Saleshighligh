-- AlterTable
ALTER TABLE "weekly_ads_roas" ADD COLUMN     "reach" INTEGER;

-- CreateTable
CREATE TABLE "weekly_ads_daily" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "spend" DECIMAL(16,2),
    "conversionValue" DECIMAL(16,2),
    "conversions" DECIMAL(14,4),
    "impressions" INTEGER,
    "reach" INTEGER,
    "clicks" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_ads_daily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_ads_campaigns" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "campaignName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "spend" DECIMAL(16,2),
    "conversionValue" DECIMAL(16,2),
    "conversions" DECIMAL(14,4),
    "impressions" INTEGER,
    "reach" INTEGER,
    "clicks" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_ads_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_ads_daily_reportWeekId_date_key" ON "weekly_ads_daily"("reportWeekId", "date");

-- CreateIndex
CREATE INDEX "weekly_ads_campaigns_reportWeekId_idx" ON "weekly_ads_campaigns"("reportWeekId");

-- AddForeignKey
ALTER TABLE "weekly_ads_daily" ADD CONSTRAINT "weekly_ads_daily_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_ads_campaigns" ADD CONSTRAINT "weekly_ads_campaigns_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

