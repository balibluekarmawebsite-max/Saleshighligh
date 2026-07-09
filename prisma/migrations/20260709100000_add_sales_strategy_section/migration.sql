-- Phase 12: Social & Plans
--
-- Adds the SALES_STRATEGY narrative section (used by the Action Plans page's
-- "Sales Strategy per Segment" block). This only *adds* an enum value and does
-- not use it in the same statement, so it runs fine in the Supabase SQL editor.

-- AlterEnum
ALTER TYPE "NarrativeSection" ADD VALUE IF NOT EXISTS 'SALES_STRATEGY' BEFORE 'ACTION_PLAN';
