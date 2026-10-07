-- CreateTable
CREATE TABLE "weekly_ads_roas" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "spend" DECIMAL(16,2),
    "revenue" DECIMAL(16,2),
    "conversionValue" DECIMAL(16,2),
    "conversions" DECIMAL(14,4),
    "impressions" INTEGER,
    "clicks" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "windowFrom" TEXT,
    "windowTo" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_ads_roas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_ads_roas_reportWeekId_platform_key" ON "weekly_ads_roas"("reportWeekId", "platform");

-- AddForeignKey
ALTER TABLE "weekly_ads_roas" ADD CONSTRAINT "weekly_ads_roas_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

