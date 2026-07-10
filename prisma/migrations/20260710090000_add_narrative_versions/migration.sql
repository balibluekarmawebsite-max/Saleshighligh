-- Phase 13: AI Narrative Generation
--
-- Append-only history of narrative edits (AI drafts, human edits, carry-forward),
-- so "Regenerate" and manual edits keep a trail.

-- CreateTable
CREATE TABLE "narrative_versions" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "section" "NarrativeSection" NOT NULL,
    "content" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "narrative_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "narrative_versions_periodId_section_idx" ON "narrative_versions"("periodId", "section");

-- AddForeignKey
ALTER TABLE "narrative_versions" ADD CONSTRAINT "narrative_versions_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
