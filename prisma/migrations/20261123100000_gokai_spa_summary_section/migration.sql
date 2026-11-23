-- A dedicated narrative section for the SPA Gokai "Upsell Analytics" summary,
-- so the spa page's AI summary describes Product Views / Upsell Sales / Upsell
-- Revenue / Refunds instead of the restaurant "Guest Experience" metrics that
-- the shared GOKAI_SUMMARY section carries.
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'GOKAI_SPA_SUMMARY';
