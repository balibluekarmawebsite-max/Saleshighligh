-- Corrective: the first add_daily_report created daily_reservation_activity;
-- the schema now uses daily_cancellations (raw Cancellation Report lines).
-- On DBs where the original already ran, this swaps the table in.

-- DropForeignKey
ALTER TABLE "daily_reservation_activity" DROP CONSTRAINT "daily_reservation_activity_propertyId_fkey";

-- DropTable
DROP TABLE "daily_reservation_activity";

-- CreateTable
CREATE TABLE "daily_cancellations" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "cancelDate" DATE NOT NULL,
    "createdDate" DATE NOT NULL,
    "nights" INTEGER NOT NULL,
    "roomQuantity" INTEGER NOT NULL DEFAULT 1,
    "reservationNumber" TEXT,
    "reservationName" TEXT,
    "guestName" TEXT,
    "arrivalDate" DATE,
    "departureDate" DATE,
    "roomType" TEXT,
    "roomRate" DECIMAL(14,2),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_cancellations_propertyId_cancelDate_idx" ON "daily_cancellations"("propertyId", "cancelDate");

-- AddForeignKey
ALTER TABLE "daily_cancellations" ADD CONSTRAINT "daily_cancellations_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

