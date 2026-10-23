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
import { occupancyCollapseError } from "@/lib/daily/collapse-guard";
import { isoToUtcDate, isValidIsoDate, yesterdayWitaIso } from "@/lib/daily/date";
import { prisma } from "@/lib/prisma";
import { parsePickupForecast, type PickupSnapshotRow } from "@/lib/daily/parse-pickup";
import { wrongPropertyError } from "@/lib/daily/property-guard";

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
    saleableRooms: r.saleableRooms,
    revenue: r.revenue,
  }));
  // Replace only the stay-years present in THIS upload. VHP's "Yearly Forecast"
  // is one calendar year per export, so a property can push two files for the
  // same snapshot date (e.g. this year + next year); scoping the delete to the
  // incoming years keeps them from wiping each other. A single forward-window
  // CSV that spans two years still replaces both, exactly as a full replace did.
  const years = [...new Set(rows.map((r) => r.stayYear))];

  await prisma.$transaction(async (tx) => {
    await tx.dailyPickupSnapshot.deleteMany({
      where: { propertyId, snapshotDate: snap, stayYear: { in: years } },
    });
    await tx.dailyPickupSnapshot.createMany({ data });
  });
  return data.length;
}

export interface PickupImportInput {
  property: string;
  /** ISO yyyy-mm-dd the reading represents; defaults to yesterday (WITA). */
  snapshotDate?: string;
  /**
   * The calendar year the forecast covers. Defaults to the snapshot date's
   * year. Set it when pushing a NEXT-year "Yearly Forecast" export (e.g.
   * year=2027 while the snapshot is still being taken in 2026), so its Jan–Dec
   * months are stored under 2027 rather than the snapshot year.
   */
  year?: string | number;
  fileBuffer?: Buffer | null;
  text?: string;
  filename?: string;
  /** Free-text origin for the audit log, e.g. "vhp:pickup". */
  source?: string;
}

/** A sensible 4-digit stay year, or null. Guards against junk like "abcd" or 25. */
function parseReportYear(raw: string | number | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Math.trunc(Number(raw));
  return Number.isFinite(n) && n >= 2000 && n <= 2100 ? n : null;
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

    // Default to YESTERDAY (WITA): a pull this morning reflects the books as of
    // yesterday's close. The scraper can still send an explicit snapshotDate.
    const snapshotDate = (input.snapshotDate ?? "").trim() || yesterdayWitaIso();
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

    // The year the CSV covers: an explicit `year` (for a next-year export) wins,
    // otherwise the snapshot date's year. This is the anchor the parser rolls
    // forward from, so a Jan–Dec 2027 file lands under 2027, not the pull year.
    const reportYear = parseReportYear(input.year) ?? Number(snapshotDate.slice(0, 4));
    const rows = parsePickupForecast(text, reportYear);
    if (!rows || rows.length === 0) {
      return fail(422, "no occupancy rows found — not a recognised Yearly Occupancy forecast, or it was empty.");
    }

    // Reject a file that was posted under the wrong property (e.g. the scraper
    // swapped BKDS/BKDU files) before it overwrites the wrong report — the
    // saleable-rooms inventory is the property fingerprint.
    const mismatch = wrongPropertyError(property, rows);
    if (mismatch) return fail(409, mismatch);

    // Reject a broken / empty export before it overwrites good data: occupancy
    // on hand can't realistically crater day-over-day, so a systemic collapse
    // versus the most recent prior reading means the pull is bad. Compared
    // against the latest snapshot STRICTLY BEFORE this date, so a legitimate
    // same-date correction (re-pushing a good file over a bad one) still lands.
    const priorDay = await prisma.dailyPickupSnapshot.findFirst({
      where: { propertyId: prop.id, snapshotDate: { lt: isoToUtcDate(snapshotDate) } },
      orderBy: { snapshotDate: "desc" },
      select: { snapshotDate: true },
    });
    if (priorDay) {
      const priorRows = await prisma.dailyPickupSnapshot.findMany({
        where: { propertyId: prop.id, snapshotDate: priorDay.snapshotDate },
        select: { stayYear: true, stayMonth: true, roomNights: true, saleableRooms: true },
      });
      const collapse = occupancyCollapseError(rows, priorRows);
      if (collapse) return fail(409, collapse);
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
