-- New-reservation pickup by agent (daily email "pick up booking details").
CREATE TABLE "daily_reservation_pickups" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "pickupDate" DATE NOT NULL,
    "agent" TEXT NOT NULL,
    "roomNights" INTEGER NOT NULL,
    "reservations" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_reservation_pickups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "daily_reservation_pickups_propertyId_pickupDate_idx" ON "daily_reservation_pickups"("propertyId", "pickupDate");

CREATE UNIQUE INDEX "daily_reservation_pickups_propertyId_pickupDate_agent_key" ON "daily_reservation_pickups"("propertyId", "pickupDate", "agent");

ALTER TABLE "daily_reservation_pickups" ADD CONSTRAINT "daily_reservation_pickups_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Arrivals / departures per stay date (daily email "Arrival / Departure" rooms).
CREATE TABLE "daily_arrival_departures" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "stayDate" DATE NOT NULL,
    "arrivalRooms" INTEGER,
    "departureRooms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_arrival_departures_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "daily_arrival_departures_propertyId_stayDate_idx" ON "daily_arrival_departures"("propertyId", "stayDate");

CREATE UNIQUE INDEX "daily_arrival_departures_propertyId_stayDate_key" ON "daily_arrival_departures"("propertyId", "stayDate");

ALTER TABLE "daily_arrival_departures" ADD CONSTRAINT "daily_arrival_departures_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
