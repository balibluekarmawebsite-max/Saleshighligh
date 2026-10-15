-- CreateTable
CREATE TABLE "weekly_last_years" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "rnSold" INTEGER NOT NULL DEFAULT 0,
    "occupancy" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "arr" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_last_years_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "weekly_last_years_propertyId_year_month_key" ON "weekly_last_years"("propertyId", "year", "month");

-- AddForeignKey
ALTER TABLE "weekly_last_years" ADD CONSTRAINT "weekly_last_years_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
