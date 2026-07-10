-- Phase 14: Report Export
--
-- Audit log of generated report exports (PPTX / PDF / group zip).

-- CreateTable
CREATE TABLE "export_history" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "period" DATE NOT NULL,
    "format" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'single',
    "sections" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "export_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_history_propertyId_period_idx" ON "export_history"("propertyId", "period");

-- AddForeignKey
ALTER TABLE "export_history" ADD CONSTRAINT "export_history_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;
