-- OTA ranking rating holds Booking.com / Expedia scores on a 0–10 scale, so a
-- perfect "10.00" must fit. Widen from numeric(3,2) (max 9.99) to numeric(4,2).
ALTER TABLE "platform_rankings" ALTER COLUMN "rating" TYPE numeric(4,2);
