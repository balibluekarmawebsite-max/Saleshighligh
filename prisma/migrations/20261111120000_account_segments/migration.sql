-- Flexible account segmentation: accountType enum -> text, + a saved
-- account->segment rule table seeded with the agreed mapping.

-- 1. account_production.accountType: enum -> text, so new segments (Direct
--    Booking, Overseas Travel Agent, B2B, …) fit without a migration each time.
ALTER TABLE "account_production" ALTER COLUMN "accountType" TYPE TEXT USING "accountType"::text;

-- 2. Remap the legacy enum values to the new segment codes.
UPDATE "account_production" SET "accountType" = 'TRAVEL_AGENT' WHERE "accountType" = 'TA';
UPDATE "account_production" SET "accountType" = 'B2B' WHERE "accountType" = 'WHOLESALER';

-- 3. Drop the now-unused enum type.
DROP TYPE "AccountType";

-- 4. Saved account->segment rules (keyed by normalised account name, so they
--    apply to every property + period and can be extended over time).
CREATE TABLE "account_segment_rules" (
    "id" TEXT NOT NULL,
    "accountKey" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "segment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_segment_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "account_segment_rules_accountKey_key" ON "account_segment_rules"("accountKey");

-- 5. Seed the agreed segmentation. ON CONFLICT so re-running is harmless.
INSERT INTO "account_segment_rules" ("id","accountKey","accountName","segment","createdAt","updatedAt")
VALUES
  (gen_random_uuid()::text, 'alaric',                       'ALARIC',                       'DIRECT_BOOKING',        now(), now()),
  (gen_random_uuid()::text, '***individual reservation***', '***INDIVIDUAL RESERVATION***', 'DIRECT_BOOKING',        now(), now()),
  (gen_random_uuid()::text, 'walk in',                      'WALK IN',                      'DIRECT_BOOKING',        now(), now()),
  (gen_random_uuid()::text, 'luxury escapes',               'Luxury Escapes',               'OVERSEAS_TRAVEL_AGENT', now(), now()),
  (gen_random_uuid()::text, 'makemy trip',                  'MakeMy Trip',                  'OTA',                   now(), now()),
  (gen_random_uuid()::text, 'bed4 travel',                  'BED4 TRAVEL',                  'B2B',                   now(), now()),
  (gen_random_uuid()::text, 't o t a l usd',                'T o t a l USD',                'EXCLUDE',               now(), now()),
  (gen_random_uuid()::text, 'redeem voucher',               'redeem voucher',               'EXCLUDE',               now(), now())
ON CONFLICT ("accountKey") DO UPDATE
  SET "segment" = EXCLUDED."segment", "accountName" = EXCLUDED."accountName", "updatedAt" = now();
