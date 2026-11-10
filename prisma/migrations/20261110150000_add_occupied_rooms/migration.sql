-- "Expected room occupied" per stay date for the daily email's
-- Yesterday/Today/Tomorrow block. Nullable, so existing rows are unaffected.
ALTER TABLE "daily_arrival_departures" ADD COLUMN "occupiedRooms" INTEGER;
