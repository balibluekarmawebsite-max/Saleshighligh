-- Section C sub-section: Stayed Guest per Segment (room nights + revenue by
-- market segment for guests who stayed). Same shape as the agent/rate-code tables.
CREATE TABLE "weekly_stayed_segment_productions" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rnSold" INTEGER,
    "grossRevenue" DECIMAL(16,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_stayed_segment_productions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_stayed_segment_productions_reportWeekId_idx" ON "weekly_stayed_segment_productions"("reportWeekId");

-- AddForeignKey
ALTER TABLE "weekly_stayed_segment_productions" ADD CONSTRAINT "weekly_stayed_segment_productions_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
