/**
 * Ingest the VHP Room Type feed into the monthly Sales Highlight.
 *
 * The scraper pulls VHP's "Forecast Room by Room Type" report for the report
 * month and POSTs the per-room-type actuals (room nights · ADR · revenue) here.
 * This replaces the ROOMTYPE section for that (property, period): find-or-create
 * the ReportPeriod, replace room_type_production in a transaction (actuals only —
 * budget left null), record ImportHistory + audit. FINAL periods are locked.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeRoomTypeRows, type RawRoomTypeRow } from "@/lib/sales/room-type-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

export interface RoomTypeImportInput {
  property: string;
  period: string; // YYYY-MM
  roomTypes: RawRoomTypeRow[];
  source?: string;
  uploadedBy?: string | null;
}

export interface RoomTypeImportResult {
  status: number;
  body:
    | {
        ok: true;
        property: string;
        period: string;
        periodId: string;
        roomTypes: number;
        roomNights: number;
        revenue: number;
        skipped: number;
        merged: number;
        message: string;
      }
    | { ok: false; error: string };
}

const fail = (status: number, error: string): RoomTypeImportResult => ({ status, body: { ok: false, error } });

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function runRoomTypeImport(input: RoomTypeImportInput): Promise<RoomTypeImportResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return fail(400, "property is required.");
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return fail(400, "period must be a real month in YYYY-MM form.");
    if (!Array.isArray(input.roomTypes) || input.roomTypes.length === 0) {
      return fail(400, "roomTypes[] is required (each {roomType, roomNights, revenue}).");
    }

    const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
    if (!property) return fail(400, `unknown property "${code}".`);

    const existing = await prisma.reportPeriod.findUnique({
      where: { propertyId_period: { propertyId: property.id, period: date } },
      select: { id: true, status: true },
    });
    if (existing?.status === "FINAL") {
      return fail(409, "This report period is marked FINAL and is locked for editing.");
    }

    const { rows, skipped, merged } = normalizeRoomTypeRows(input.roomTypes);
    if (rows.length === 0) return fail(422, "no valid room-type rows found.");

    const periodId = await prisma.$transaction(async (tx) => {
      const period =
        existing ??
        (await tx.reportPeriod.create({
          data: { propertyId: property.id, period: date, status: "DRAFT" },
          select: { id: true, status: true },
        }));
      await tx.roomTypeProduction.deleteMany({ where: { periodId: period.id } });
      await tx.roomTypeProduction.createMany({
        data: rows.map((r) => ({
          periodId: period.id,
          roomTypeName: r.roomTypeName,
          roomNightsActual: r.roomNights,
          adrActual: r.adr,
          revenueActual: r.revenue,
        })),
      });
      await tx.importHistory.create({
        data: {
          propertyId: property.id,
          period: date,
          fileName: `VHP Forecast Room by Room Type — ${input.source ?? "api"}`,
          uploadedBy: input.uploadedBy ?? null,
          rowCounts: { ROOMTYPE: rows.length },
        },
      });
      return period.id;
    });

    const roomNights = rows.reduce((s, r) => s + r.roomNights, 0);
    const revenue = rows.reduce((s, r) => s + r.revenue, 0);

    await logAudit("sales_room_type_import", code, {
      period: input.period,
      roomTypes: rows.length,
      roomNights,
      skipped,
      merged,
      source: input.source ?? null,
    }).catch(() => {});

    const notes = [merged > 0 ? `merged ${merged}` : "", skipped > 0 ? `skipped ${skipped}` : ""].filter(Boolean);
    return {
      status: 200,
      body: {
        ok: true,
        property: code,
        period: input.period,
        periodId,
        roomTypes: rows.length,
        roomNights,
        revenue,
        skipped,
        merged,
        message: `Room Types stored — ${rows.length} room type(s) for ${input.period}${notes.length ? ` (${notes.join("; ")})` : ""}.`,
      },
    };
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : "room type import failed.");
  }
}
