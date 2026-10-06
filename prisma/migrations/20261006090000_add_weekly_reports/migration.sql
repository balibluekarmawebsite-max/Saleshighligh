-- CreateEnum
CREATE TYPE "WeeklyReportStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'READY_FOR_REVIEW', 'APPROVED', 'EXPORTED');

-- CreateTable
CREATE TABLE "weekly_reports" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "year" INTEGER NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "label" TEXT,
    "status" "WeeklyReportStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerId" TEXT,
    "lockedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_budgets" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "rnSold" INTEGER NOT NULL DEFAULT 0,
    "occupancy" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "arr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_market_segments" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_market_segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_rate_codes" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_rate_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_channels" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_settings" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "group" TEXT NOT NULL DEFAULT 'general',
    "key" TEXT NOT NULL,
    "value" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_monthly_stats" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "rnSold" INTEGER,
    "occActual" DECIMAL(7,4),
    "occBudget" DECIMAL(7,4),
    "occLy" DECIMAL(7,4),
    "arrActual" DECIMAL(14,2),
    "arrBudget" DECIMAL(14,2),
    "arrLy" DECIMAL(14,2),
    "revActual" DECIMAL(16,2),
    "revBudget" DECIMAL(16,2),
    "revLy" DECIMAL(16,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_monthly_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_segment_productions" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "segmentGroup" TEXT,
    "rnSold" INTEGER,
    "grossRevenue" DECIMAL(16,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_segment_productions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_rate_code_productions" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rnSold" INTEGER,
    "grossRevenue" DECIMAL(16,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_rate_code_productions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_channel_month_rn" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "sourceLabel" TEXT NOT NULL,
    "jan" INTEGER NOT NULL DEFAULT 0,
    "feb" INTEGER NOT NULL DEFAULT 0,
    "mar" INTEGER NOT NULL DEFAULT 0,
    "apr" INTEGER NOT NULL DEFAULT 0,
    "may" INTEGER NOT NULL DEFAULT 0,
    "jun" INTEGER NOT NULL DEFAULT 0,
    "jul" INTEGER NOT NULL DEFAULT 0,
    "aug" INTEGER NOT NULL DEFAULT 0,
    "sep" INTEGER NOT NULL DEFAULT 0,
    "oct" INTEGER NOT NULL DEFAULT 0,
    "nov" INTEGER NOT NULL DEFAULT 0,
    "dec" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_channel_month_rn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_owner_repeater_months" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "roomNights" INTEGER,
    "revenue" DECIMAL(16,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_owner_repeater_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_owner_channel_mix" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rnSold" INTEGER,
    "grossRevenue" DECIMAL(16,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_owner_channel_mix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_overview_blocks" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT,
    "aiDraft" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_overview_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_activities" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "dateLabel" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_social_media_metrics" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'Instagram',
    "metricKey" TEXT NOT NULL,
    "lastWeek" INTEGER,
    "thisWeek" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_social_media_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_trainings" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "dateLabel" TEXT,
    "topic" TEXT NOT NULL,
    "duration" TEXT,
    "trainer" TEXT,
    "participants" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_trainings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_action_plans" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "category" TEXT,
    "plan" TEXT NOT NULL,
    "startLabel" TEXT,
    "deadlineLabel" TEXT,
    "remark" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_action_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_imports" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "propertyId" TEXT,
    "reportWeekId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "originalFilename" TEXT NOT NULL,
    "storedPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "periodLabel" TEXT,
    "summary" JSONB,
    "warnings" JSONB,
    "error" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_ai_drafts" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "fieldKey" TEXT,
    "mode" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_ai_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_reports_propertyId_endDate_idx" ON "weekly_reports"("propertyId", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_reports_propertyId_startDate_key" ON "weekly_reports"("propertyId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_budgets_propertyId_year_month_key" ON "weekly_budgets"("propertyId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_market_segments_propertyId_code_key" ON "weekly_market_segments"("propertyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_rate_codes_propertyId_code_key" ON "weekly_rate_codes"("propertyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_channels_propertyId_code_key" ON "weekly_channels"("propertyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_settings_propertyId_group_key_key" ON "weekly_settings"("propertyId", "group", "key");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_monthly_stats_reportWeekId_month_key" ON "weekly_monthly_stats"("reportWeekId", "month");

-- CreateIndex
CREATE INDEX "weekly_segment_productions_reportWeekId_idx" ON "weekly_segment_productions"("reportWeekId");

-- CreateIndex
CREATE INDEX "weekly_rate_code_productions_reportWeekId_idx" ON "weekly_rate_code_productions"("reportWeekId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_channel_month_rn_reportWeekId_year_sourceLabel_key" ON "weekly_channel_month_rn"("reportWeekId", "year", "sourceLabel");

-- CreateIndex
CREATE INDEX "weekly_owner_repeater_months_reportWeekId_idx" ON "weekly_owner_repeater_months"("reportWeekId");

-- CreateIndex
CREATE INDEX "weekly_owner_channel_mix_reportWeekId_idx" ON "weekly_owner_channel_mix"("reportWeekId");

-- CreateIndex
CREATE UNIQUE INDEX "weekly_overview_blocks_reportWeekId_key_key" ON "weekly_overview_blocks"("reportWeekId", "key");

-- CreateIndex
CREATE INDEX "weekly_activities_reportWeekId_department_idx" ON "weekly_activities"("reportWeekId", "department");

-- CreateIndex
CREATE INDEX "weekly_social_media_metrics_reportWeekId_idx" ON "weekly_social_media_metrics"("reportWeekId");

-- CreateIndex
CREATE INDEX "weekly_trainings_reportWeekId_idx" ON "weekly_trainings"("reportWeekId");

-- CreateIndex
CREATE INDEX "weekly_action_plans_reportWeekId_idx" ON "weekly_action_plans"("reportWeekId");

-- CreateIndex
CREATE INDEX "weekly_imports_reportWeekId_idx" ON "weekly_imports"("reportWeekId");

-- CreateIndex
CREATE INDEX "weekly_ai_drafts_reportWeekId_section_idx" ON "weekly_ai_drafts"("reportWeekId", "section");

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_budgets" ADD CONSTRAINT "weekly_budgets_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_market_segments" ADD CONSTRAINT "weekly_market_segments_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_rate_codes" ADD CONSTRAINT "weekly_rate_codes_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_channels" ADD CONSTRAINT "weekly_channels_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_settings" ADD CONSTRAINT "weekly_settings_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_monthly_stats" ADD CONSTRAINT "weekly_monthly_stats_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_segment_productions" ADD CONSTRAINT "weekly_segment_productions_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_rate_code_productions" ADD CONSTRAINT "weekly_rate_code_productions_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_channel_month_rn" ADD CONSTRAINT "weekly_channel_month_rn_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_owner_repeater_months" ADD CONSTRAINT "weekly_owner_repeater_months_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_owner_channel_mix" ADD CONSTRAINT "weekly_owner_channel_mix_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_overview_blocks" ADD CONSTRAINT "weekly_overview_blocks_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_activities" ADD CONSTRAINT "weekly_activities_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_social_media_metrics" ADD CONSTRAINT "weekly_social_media_metrics_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_trainings" ADD CONSTRAINT "weekly_trainings_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_action_plans" ADD CONSTRAINT "weekly_action_plans_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_imports" ADD CONSTRAINT "weekly_imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_imports" ADD CONSTRAINT "weekly_imports_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_imports" ADD CONSTRAINT "weekly_imports_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_ai_drafts" ADD CONSTRAINT "weekly_ai_drafts_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_ai_drafts" ADD CONSTRAINT "weekly_ai_drafts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

