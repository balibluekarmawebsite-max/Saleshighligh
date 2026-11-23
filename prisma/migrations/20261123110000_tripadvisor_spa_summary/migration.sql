-- Reported month-over-month % for the "New Reviews" Tripadvisor card (the spa
-- listing report prints one, e.g. "+33%"); nullable, used by both units.
ALTER TABLE "tripadvisor_metrics" ADD COLUMN "newReviewsMom" DECIMAL(14,4);

-- Dedicated narrative section for the SPA Tripadvisor summary, so the spa page's
-- AI summary describes the spa listing (Spas & Wellness ranking) rather than
-- sharing the restaurant's TRIPADVISOR_SUMMARY row.
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'TRIPADVISOR_SPA_SUMMARY';
