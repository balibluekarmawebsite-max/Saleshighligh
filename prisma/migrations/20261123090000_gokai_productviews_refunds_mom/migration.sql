-- Reported month-over-month % for the spa Gokai "Upsell Analytics" cards that
-- carry their own "% from last month" but have no restaurant equivalent:
-- Product Views and Refunds. Nullable; a computed MoM is used when absent.
ALTER TABLE "gokai_reports" ADD COLUMN "productViewsMom" DECIMAL(14,4);
ALTER TABLE "gokai_reports" ADD COLUMN "refundsMom" DECIMAL(14,4);
