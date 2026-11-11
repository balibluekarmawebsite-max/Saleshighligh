/**
 * Save compiled Market Segment rows into segment_production for one
 * (property, period, scope). Replaces that scope's rows in a transaction,
 * creates the period as DRAFT if needed, refuses a FINAL period, and records an
 * ImportHistory + audit row. Shared by the segments page's save action.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { expandToRows, type ExtractedSegment } from "@/lib/sales/market-segment-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

export interface SaveMarketSegmentInput {
  property: string;
  period: string; // YYYY-MM
  scope: "MTD" | "YTD";
  segments: ExtractedSegment[];
  uploadedBy?: string | null;
}

export interface SaveMarketSegmentResult {
  ok: boolean;
  message: string;
  rows?: number;
  segments?: number;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveMarketSegments(input: SaveMarketSegmentInput): Promise<SaveMarketSegmentResult> {
  const code = String(input.property ?? "").trim().toUpperCase();
  if (!code) return { ok: false, message: "property is required." };
  const date = periodDate(String(input.period ?? "").trim());
  if (!date) return { ok: false, message: "period must be a real month (YYYY-MM)." };
  const scope = input.scope === "YTD" ? "YTD" : "MTD";

  const rows = expandToRows(Array.isArray(input.segments) ? input.segments : [], scope);
  if (rows.length === 0) return { ok: false, message: "No segment rows to save." };

  try {
    const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
    if (!property) return { ok: false, message: `Unknown property "${code}".` };

    const existing = await prisma.reportPeriod.findUnique({
      where: { propertyId_period: { propertyId: property.id, period: date } },
      select: { id: true, status: true },
    });
    if (existing?.status === "FINAL") {
      return { ok: false, message: "This report period is marked FINAL and is locked for editing." };
    }

    await prisma.$transaction(async (tx) => {
      const period =
        existing ??
        (await tx.reportPeriod.create({
          data: { propertyId: property.id, period: date, status: "DRAFT" },
          select: { id: true, status: true },
        }));
      await tx.segmentProduction.deleteMany({ where: { periodId: period.id, scope } });
      await tx.segmentProduction.createMany({
        data: rows.map((r) => ({
          periodId: period.id,
          scope: r.scope,
          segmentName: r.segmentName,
          series: r.series,
          roomNights: r.roomNights,
          arr: r.arr,
          roomRevenue: r.roomRevenue,
        })),
      });
      await tx.importHistory.create({
        data: {
          propertyId: property.id,
          period: date,
          fileName: `Market Segment (${scope}) — manual/AI`,
          uploadedBy: input.uploadedBy ?? null,
          rowCounts: { [`SEGMENT_${scope}`]: rows.length },
        },
      });
    });

    const segments = new Set(rows.map((r) => r.segmentName)).size;
    await logAudit("sales_market_segment_import", code, {
      period: input.period,
      scope,
      segments,
      rows: rows.length,
    }).catch(() => {});

    return { ok: true, message: `Saved ${segments} segment(s) for ${input.period} (${scope}).`, rows: rows.length, segments };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save segments." };
  }
}
