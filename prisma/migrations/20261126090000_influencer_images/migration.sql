-- Influencer Collaboration: screenshot image + ordering.
ALTER TABLE "influencer_collabs" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
ALTER TABLE "influencer_collabs" ADD COLUMN IF NOT EXISTS "imageKey" TEXT;
ALTER TABLE "influencer_collabs" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "influencer_collabs_periodId_idx" ON "influencer_collabs" ("periodId");
