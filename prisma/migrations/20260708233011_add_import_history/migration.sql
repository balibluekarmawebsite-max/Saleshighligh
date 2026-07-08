-- CreateTable
CREATE TABLE "import_history" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "period" DATE NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "rowCounts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_history_propertyId_period_idx" ON "import_history"("propertyId", "period");

-- AddForeignKey
ALTER TABLE "import_history" ADD CONSTRAINT "import_history_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
