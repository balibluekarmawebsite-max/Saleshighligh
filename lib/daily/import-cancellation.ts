/**
 * Ingestion for the "Cancellation Report" daily feed (`CANCEL`).
 *
 * The scraper POSTs the VHP cancellation CSV to `/api/daily/cancellation`; this
 * parses it into raw lines and stores them, REPLACING every cancel date present
 * in the batch (idempotent at the cancelDate grain — re-posting a day's export
 * just re-applies that day). The same-day book-and-cancel exclusion is applied
 * when the report reads the data (lib/daily/calculations.ts), not here, so the
 * raw lines are preserved.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseCancellationReport, type CancellationRow } from "@/lib/daily/parse-cancellation";

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/**
 * Store cancellation lines for a property, replacing every cancel date present
 * in the batch. Returns the number of rows written.
 */
export async function applyCancellationRows(propertyId: string, rows: CancellationRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const cancelDates = Array.from(new Set(rows.map((r) => r.cancelDate))).map(day);
  const data = rows.map((r) => ({
    propertyId,
    cancelDate: day(r.cancelDate),
    createdDate: day(r.createdDate),
    nights: r.nights,
    roomQuantity: r.roomQuantity,
    reservationNumber: r.reservationNumber,
    reservationName: r.reservationName,
    guestName: r.guestName,
    arrivalDate: r.arrivalDate ? day(r.arrivalDate) : null,
    departureDate: r.departureDate ? day(r.departureDate) : null,
    roomType: r.roomType,
    roomRate: r.roomRate,
    cancelReason: r.cancelReason,
  }));

  await prisma.$transaction(async (tx) => {
    await tx.dailyCancellation.deleteMany({ where: { propertyId, cancelDate: { in: cancelDates } } });
    await tx.dailyCancellation.createMany({ data });
  });
  return data.length;
}

export interface CancellationImportInput {
  property: string;
  fileBuffer?: Buffer | null;
  text?: string;
  filename?: string;
  /** Free-text origin for the audit log, e.g. "vhp:cancellation". */
  source?: string;
}

export interface CancellationImportResult {
  status: number;
  body:
    | { ok: true; property: string; cancelDates: string[]; written: number; message: string }
    | { ok: false; error: string };
}

const fail = (status: number, error: string): CancellationImportResult => ({ status, body: { ok: false, error } });

/** Parse + store a Cancellation Report upload. Never throws (returns a result). */
export async function runCancellationImport(input: CancellationImportInput): Promise<CancellationImportResult> {
  try {
    const property = input.property.trim().toUpperCase();
    if (!property) return fail(400, "property is required.");

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

    const rows = parseCancellationReport(text);
    if (!rows || rows.length === 0) {
      return fail(422, "no cancellation rows found — not a recognised Cancellation Report, or it was empty.");
    }

    const written = await applyCancellationRows(prop.id, rows);
    const cancelDates = Array.from(new Set(rows.map((r) => r.cancelDate))).sort();

    await logAudit("daily_cancellation_import", property, {
      rows: written,
      cancelDates,
      source: input.source ?? null,
      filename: input.filename ?? null,
    }).catch(() => {});

    return {
      status: 200,
      body: {
        ok: true,
        property,
        cancelDates,
        written,
        message: `Cancellation Report stored — ${written} line(s) across ${cancelDates.length} cancel date(s).`,
      },
    };
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : "cancellation import failed.");
  }
}
