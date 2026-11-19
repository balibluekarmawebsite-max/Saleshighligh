-- Section C sub-section: Repeater Guest production (room nights + revenue by
-- agent/source for repeat guests). Same shape as the agent/rate-code tables.
CREATE TABLE "weekly_repeater_productions" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rnSold" INTEGER,
    "grossRevenue" DECIMAL(16,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_repeater_productions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_repeater_productions_reportWeekId_idx" ON "weekly_repeater_productions"("reportWeekId");

-- AddForeignKey
ALTER TABLE "weekly_repeater_productions" ADD CONSTRAINT "weekly_repeater_productions_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
