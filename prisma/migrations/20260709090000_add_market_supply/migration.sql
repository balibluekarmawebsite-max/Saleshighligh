-- Phase 11: Market Intelligence & Forecast
--
-- Adds the MARKET_INTEL narrative section and a MarketSupply model (competitive
-- supply context for a property's market area).
--
-- NOTE (Supabase SQL editor): Postgres will not let a newly added enum value be
-- USED in the same transaction that adds it. This migration only *adds* the
-- value (it isn't referenced here), so it runs fine. If your editor wraps
-- everything in one transaction and complains, run the ALTER TYPE line on its
-- own first, then the rest.

-- AlterEnum
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'MARKET_INTEL' BEFORE 'ACTION_PLAN';

-- CreateTable
CREATE TABLE "market_supply" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "areaName" TEXT NOT NULL,
    "propertiesCount" INTEGER NOT NULL,
    "propertiesCountLastYear" INTEGER,

    CONSTRAINT "market_supply_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "market_supply_periodId_areaName_key" ON "market_supply"("periodId", "areaName");

-- AddForeignKey
ALTER TABLE "market_supply" ADD CONSTRAINT "market_supply_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
