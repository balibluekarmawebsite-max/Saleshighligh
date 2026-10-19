-- Daily Report module (see DAILY_REPORT_PLAN.md): day-by-day VHP feeds.
-- Capacity, pick-up snapshots, reservation/cancellation activity, per-stay-date
-- room revenue, market-segment budget/actual, and break-even — all per property.

-- CreateTable
CREATE TABLE "daily_capacities" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "roomsAvailable" INTEGER NOT NULL,
    "roomsOutOfOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_capacities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_pickup_snapshots" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "snapshotDate" DATE NOT NULL,
    "stayYear" INTEGER NOT NULL,
    "stayMonth" INTEGER NOT NULL,
    "roomNights" INTEGER NOT NULL,
    "revenue" DECIMAL(16,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_pickup_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reservation_activity" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "reservationRoomNights" INTEGER NOT NULL DEFAULT 0,
    "cancellationRoomNights" INTEGER NOT NULL DEFAULT 0,
    "reservationRevenue" DECIMAL(16,2),
    "cancellationRevenue" DECIMAL(16,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_reservation_activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_room_revenue" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "stayDate" DATE NOT NULL,
    "roomNights" INTEGER NOT NULL,
    "revenue" DECIMAL(16,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_room_revenue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_segment_performance" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "segment" TEXT NOT NULL,
    "budgetRoomNights" INTEGER,
    "actualRoomNights" INTEGER,
    "budgetRevenue" DECIMAL(16,2),
    "actualRevenue" DECIMAL(16,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_segment_performance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_break_even" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "budgetRevenue" DECIMAL(16,2),
    "fixedCost" DECIMAL(16,2),
    "variableCost" DECIMAL(16,2),
    "bepAdr" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_break_even_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_capacities_propertyId_year_month_key" ON "daily_capacities"("propertyId", "year", "month");

-- CreateIndex
CREATE INDEX "daily_pickup_snapshots_propertyId_stayYear_stayMonth_idx" ON "daily_pickup_snapshots"("propertyId", "stayYear", "stayMonth");

-- CreateIndex
CREATE UNIQUE INDEX "daily_pickup_snapshots_propertyId_snapshotDate_stayYear_sta_key" ON "daily_pickup_snapshots"("propertyId", "snapshotDate", "stayYear", "stayMonth");

-- CreateIndex
CREATE INDEX "daily_reservation_activity_propertyId_businessDate_idx" ON "daily_reservation_activity"("propertyId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reservation_activity_propertyId_businessDate_key" ON "daily_reservation_activity"("propertyId", "businessDate");

-- CreateIndex
CREATE INDEX "daily_room_revenue_propertyId_stayDate_idx" ON "daily_room_revenue"("propertyId", "stayDate");

-- CreateIndex
CREATE UNIQUE INDEX "daily_room_revenue_propertyId_stayDate_key" ON "daily_room_revenue"("propertyId", "stayDate");

-- CreateIndex
CREATE UNIQUE INDEX "daily_segment_performance_propertyId_year_month_segment_key" ON "daily_segment_performance"("propertyId", "year", "month", "segment");

-- CreateIndex
CREATE UNIQUE INDEX "daily_break_even_propertyId_year_month_key" ON "daily_break_even"("propertyId", "year", "month");

-- AddForeignKey
ALTER TABLE "daily_capacities" ADD CONSTRAINT "daily_capacities_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_pickup_snapshots" ADD CONSTRAINT "daily_pickup_snapshots_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reservation_activity" ADD CONSTRAINT "daily_reservation_activity_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_room_revenue" ADD CONSTRAINT "daily_room_revenue_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_segment_performance" ADD CONSTRAINT "daily_segment_performance_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_break_even" ADD CONSTRAINT "daily_break_even_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

