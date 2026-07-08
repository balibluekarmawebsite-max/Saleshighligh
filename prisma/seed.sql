-- Seed foundational reference data: the three Blue Karma properties and their
-- restaurant + spa outlets. Mirrors prisma/seed.ts for manual application via
-- the Supabase SQL editor. Idempotent (ON CONFLICT upserts) — safe to re-run.

INSERT INTO "properties" ("id", "code", "name", "location", "createdAt", "updatedAt") VALUES
  ('prop_bkds', 'BKDS', 'Blue Karma Dijiwa Seminyak', 'Seminyak, Bali', now(), now()),
  ('prop_bkdu', 'BKDU', 'Blue Karma Dijiwa Ubud',     'Ubud, Bali',     now(), now()),
  ('prop_bkv',  'BKV',  'Blue Karma Village',          'Bali',           now(), now())
ON CONFLICT ("code") DO UPDATE
  SET "name" = EXCLUDED."name", "location" = EXCLUDED."location", "updatedAt" = now();

INSERT INTO "outlets" ("id", "propertyId", "kind", "name", "createdAt", "updatedAt") VALUES
  ('out_bkds_restaurant', 'prop_bkds', 'restaurant', 'BKeto',         now(), now()),
  ('out_bkds_spa',        'prop_bkds', 'spa',        'Mudara',        now(), now()),
  ('out_bkdu_restaurant', 'prop_bkdu', 'restaurant', 'Botanist',      now(), now()),
  ('out_bkdu_spa',        'prop_bkdu', 'spa',        'Flying Bamboo', now(), now()),
  ('out_bkv_restaurant',  'prop_bkv',  'restaurant', 'Hiiragi',       now(), now()),
  ('out_bkv_spa',         'prop_bkv',  'spa',        'Heiwa',         now(), now())
ON CONFLICT ("propertyId", "kind") DO UPDATE
  SET "name" = EXCLUDED."name", "updatedAt" = now();
