-- Add OpenAI as a third ads platform (the ads dashboard now reports it alongside
-- Google and Meta). Placed before CORPORATE to match the schema order.
ALTER TYPE "AdsPlatform" ADD VALUE IF NOT EXISTS 'OPENAI' BEFORE 'CORPORATE';
