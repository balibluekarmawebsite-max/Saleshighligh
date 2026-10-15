-- Data backfill (idempotent): populate the fixed WeeklyLastYear table from the
-- legacy per-week Last Year columns (weekly_monthly_stats.occLy / arrLy / revLy)
-- that earlier weekly reports carried. Running this inside the migration means
-- it happens automatically at deploy — BEFORE any Section B save can clear those
-- legacy columns — so there is no manual "run the backfill first" ordering trap.
--
-- For each (property, year, month) it takes the most recent week's Last Year
-- values (by report end date). Occupancy is ×100 (0–1 fraction → percent).
-- ON CONFLICT DO NOTHING so it never clobbers a value already set on the Budget
-- & Last Year page and is safe to re-run.
INSERT INTO "weekly_last_years" ("id", "propertyId", "year", "month", "rnSold", "occupancy", "arr", "revenue", "createdAt", "updatedAt")
SELECT
  md5(random()::text || s."propertyId" || s."year"::text || s."month"::text),
  s."propertyId",
  s."year",
  s."month",
  0,
  COALESCE(s."occLy" * 100, 0),
  COALESCE(s."arrLy", 0),
  COALESCE(s."revLy", 0),
  NOW(),
  NOW()
FROM (
  SELECT DISTINCT ON (r."propertyId", r."year", m."month")
    r."propertyId", r."year", m."month", m."occLy", m."arrLy", m."revLy"
  FROM "weekly_monthly_stats" m
  JOIN "weekly_reports" r ON r."id" = m."reportWeekId"
  WHERE m."occLy" IS NOT NULL OR m."arrLy" IS NOT NULL OR m."revLy" IS NOT NULL
  ORDER BY r."propertyId", r."year", m."month", r."endDate" DESC
) s
ON CONFLICT ("propertyId", "year", "month") DO NOTHING;
