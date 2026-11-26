-- Ongoing-promotion image galleries (Action Plans page), grouped by unit.
CREATE TABLE "promotion_images" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "promotion_images_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "promotion_images_periodId_idx" ON "promotion_images" ("periodId");

ALTER TABLE "promotion_images"
    ADD CONSTRAINT "promotion_images_periodId_fkey"
    FOREIGN KEY ("periodId") REFERENCES "report_periods" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
