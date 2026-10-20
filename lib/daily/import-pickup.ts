/**
 * Ingestion for the "Occupancy Pickup Report" daily feed (`PICKUP`).
 *
 * The scraper POSTs the VHP "Yearly Forecast Of Room Occupancy" CSV to
 * `/api/daily/pickup` once a day; this parses it into per-stay-month rooms (and
 * revenue) on the books and stores them under the snapshot date, REPLACING that
 * snapshot date's rows (idempotent — re-posting a day's reading just re-applies
 * it). Occupancy-on-hand, pickup/day, pace vs last year and ADR are DERIVED when
 * the report reads the data (lib/daily/calculations.ts), never stored.
 */

import { logAudit } from "@/lib/audit";
import { isoToUtcDate, isValidIsoDate, todayIso } from "@/lib/daily/date";
import { prisma } from "@/lib/prisma";
import { parsePickupForecast, type PickupSnapshotRow } from "@/lib/daily/parse-pickup";

/**
 * Store an occupancy-pickup snapshot for a property, replacing every row for
 * that snapshot date. Returns the number of stay-month rows written.
 */
export async function applyPickupRows(
  propertyId: string,
  snapshotDate: string,
  rows: PickupSnapshotRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const snap = isoToUtcDate(snapshotDate);
  const data = rows.map((r) => ({
    propertyId,
    snapshotDate: snap,
    stayYear: r.stayYear,
    stayMonth: r.stayMonth,
    roomNights: r.roomNights,
    revenue: r.revenue,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.dailyPickupSnapshot.deleteMany({ where: { propertyId, snapshotDate: snap } });
    await tx.dailyPickupSnapshot.createMany({ data });
  });
  return data.length;
}

export interface PickupImportInput {
  property: string;
  /** ISO yyyy-mm-dd the reading was taken; defaults to today (UTC). */
  snapshotDate?: string;
  fileBuffer?: Buffer | null;
  text?: string;
  filename?: string;
  /** Free-text origin for the audit log, e.g. "vhp:pickup". */
  source?: string;
}

export interface PickupImportResult {
  status: number;
  body:
    | { ok: true; property: string; snapshotDate: string; stayMonths: string[]; written: number; message: string }
    | { ok: false; error: string };
}

const fail = (status: number, error: string): PickupImportResult => ({ status, body: { ok: false, error } });

/** Parse + store an Occupancy Pickup upload. Never throws (returns a result). */
export async function runPickupImport(input: PickupImportInput): Promise<PickupImportResult> {
  try {
    const property = input.property.trim().toUpperCase();
    if (!property) return fail(400, "property is required.");

    const snapshotDate = (input.snapshotDate ?? "").trim() || todayIso();
    if (!isValidIsoDate(snapshotDate)) {
      return fail(400, "snapshotDate must be a real calendar date in yyyy-mm-dd form.");
    }

    let text = input.text ?? "";
    if (!text && input.fileBuffer) {
      try {
        text = input.fileBuffer.toString("utf8");
      } catch {
        return fail(400, "could not read the file as text.");
      }
    }
    if (!text.trim()) return fail(400, "a file (or text) is required.");

    const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
    if (!prop) return fail(400, `unknown property "${property}".`);

    const reportYear = Number(snapshotDate.slice(0, 4));
    const rows = parsePickupForecast(text, reportYear);
    if (!rows || rows.length === 0) {
      return fail(422, "no occupancy rows found — not a recognised Yearly Occupancy forecast, or it was empty.");
    }

    const written = await applyPickupRows(prop.id, snapshotDate, rows);
    const stayMonths = rows.map((r) => `${r.stayYear}-${String(r.stayMonth).padStart(2, "0")}`);

    await logAudit("daily_pickup_import", property, {
      rows: written,
      snapshotDate,
      stayMonths,
      source: input.source ?? null,
      filename: input.filename ?? null,
    }).catch(() => {});

    return {
      status: 200,
      body: {
        ok: true,
        property,
        snapshotDate,
        stayMonths,
        written,
        message: `Occupancy Pickup stored — ${written} stay-month(s) as of ${snapshotDate}.`,
      },
    };
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : "pickup import failed.");
  }
}
