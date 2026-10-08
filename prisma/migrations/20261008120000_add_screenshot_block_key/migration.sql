-- Attach a weekly SM screenshot to a Section A overview block (null = general SM).
ALTER TABLE "weekly_screenshots" ADD COLUMN "blockKey" TEXT;
