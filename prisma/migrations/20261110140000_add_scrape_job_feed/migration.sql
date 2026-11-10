-- Per-feed daily re-pull: which daily feed a section-"D" job targets
-- (null = the whole daily pull). Nullable, so existing jobs are unaffected.
ALTER TABLE "scrape_jobs" ADD COLUMN "feed" TEXT;
