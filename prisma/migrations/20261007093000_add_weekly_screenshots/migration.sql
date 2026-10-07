-- CreateTable
CREATE TABLE "weekly_screenshots" (
    "id" TEXT NOT NULL,
    "reportWeekId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "title" TEXT,
    "imageUrl" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "summary" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "weekly_screenshots_reportWeekId_idx" ON "weekly_screenshots"("reportWeekId");

-- AddForeignKey
ALTER TABLE "weekly_screenshots" ADD CONSTRAINT "weekly_screenshots_reportWeekId_fkey" FOREIGN KEY ("reportWeekId") REFERENCES "weekly_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

