-- On-demand scrape job queue (VHP_JOBS_INTEGRATION).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS "scrape_jobs" (
    "id" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "month" TEXT,
    "weekEnding" DATE,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "worker" TEXT,
    "message" TEXT,
    "written" INTEGER,
    "requestedById" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "scrape_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "scrape_jobs_status_requestedAt_idx" ON "scrape_jobs"("status", "requestedAt");
