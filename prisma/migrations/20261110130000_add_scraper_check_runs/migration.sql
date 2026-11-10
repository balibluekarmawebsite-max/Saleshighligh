-- Scraper-health check run history + alert de-duplication (lib/monitor).
CREATE TABLE "scraper_check_runs" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL DEFAULT 'cron',
    "dateWita" TEXT NOT NULL,
    "openGaps" JSONB NOT NULL,
    "newGaps" JSONB NOT NULL,
    "recovered" JSONB NOT NULL,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailError" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scraper_check_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scraper_check_runs_ranAt_idx" ON "scraper_check_runs"("ranAt");
