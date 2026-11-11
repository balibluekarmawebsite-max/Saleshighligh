-- Room Types report is actuals-only (VHP forecast-room-by-room-type has no
-- budget). Make the budget columns optional; legacy workbook imports may still
-- fill them.
ALTER TABLE "room_type_production" ALTER COLUMN "roomNightsBudget" DROP NOT NULL;
ALTER TABLE "room_type_production" ALTER COLUMN "adrBudget" DROP NOT NULL;
ALTER TABLE "room_type_production" ALTER COLUMN "revenueBudget" DROP NOT NULL;
