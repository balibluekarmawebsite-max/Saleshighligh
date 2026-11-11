/**
 * Ingest the VHP "Arrival Guest" raw feed into the monthly Sales Highlight.
 *
 * The scraper POSTs raw arrival rows for a (property, period, scope); the server
 * COMPILES them (compileGuestArrivals) into nationality room-nights + a LOS
 * distribution and stores them. Nationality is scoped MTD/YTD (two pulls: the
 * report month, and Jan→month for YTD). Length-of-stay is stored once per period
 * from the MTD pull. An optional lastYearArrivals set (same window, prior year)
 * is compiled the same way and attached as the vs-LY figures. A FINAL period is
 * locked, like the Excel import.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { compileGuestArrivals, type NationalityAgg, type RawArrival } from "@/lib/sales/guest-arrivals-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

export type GuestScope = "MTD" | "YTD";

export interface GuestArrivalsImportInput {
  property: string;
  period: string; // YYYY-MM
  scope?: string; // MTD (default) | YTD
  arrivals: RawArrival[];
  /** Optional: same window a year earlier, for VS-LY + rank movement. */
  lastYearArrivals?: RawArrival[];
  source?: string;
  uploadedBy?: string | null;
}

export interface GuestArrivalsResult {
  status: number;
  body:
    | {
        ok: true;
        property: string;
        period: string;
        periodId: string;
        scope: GuestScope;
        nationalities: number;
        losBuckets: number;
        roomNights: number;
        guests: number | null;
        skipped: number;
        message: string;
      }
    | { ok: false; error: string };
}

const fail = (status: number, error: string): GuestArrivalsResult => ({ status, body: { ok: false, error } });

/** Thrown inside the transaction when the period is FINAL — mapped to a 409. */
class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

/** Same key the compiler merges on: code if known, else the lower-cased name. */
const natKey = (n: { countryCode: string | null; countryName: string }) =>
  n.countryCode ? `C:${n.countryCode}` : `N:${n.countryName.toLowerCase()}`;

export async function runGuestArrivalsImport(input: GuestArrivalsImportInput): Promise<GuestArrivalsResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return fail(400, "property is required.");
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return fail(400, "period must be a real month in YYYY-MM form.");

    const scopeRaw = String(input.scope ?? "MTD").trim().toUpperCase();
    if (scopeRaw !== "MTD" && scopeRaw !== "YTD") return fail(400, 'scope must be "MTD" or "YTD".');
    const scope: GuestScope = scopeRaw;

    if (!Array.isArray(input.arrivals) || input.arrivals.length === 0) {
      return fail(400, "arrivals[] is required (each {country, arrival, departure} or {country, nights}).");
    }

    const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
    if (!property) return fail(400, `unknown property "${code}".`);

    const existing = await prisma.reportPeriod.findUnique({
      where: { propertyId_period: { propertyId: property.id, period: date } },
      select: { id: true, status: true },
    });
    if (existing?.status === "FINAL") return fail(409, FINAL_MSG);

    const compiled = compileGuestArrivals(input.arrivals);
    if (compiled.nationality.length === 0) return fail(422, "no valid arrival rows found.");

    // Last-year attach (optional): compile the prior-year window the same way.
    const lyArrivals = Array.isArray(input.lastYearArrivals) ? input.lastYearArrivals : [];
    const ly = lyArrivals.length > 0 ? compileGuestArrivals(lyArrivals) : null;
    const lyNatByKey = new Map<string, NationalityAgg>(ly ? ly.nationality.map((n) => [natKey(n), n]) : []);
    const lyLosByBucket = new Map<string, number>(ly ? ly.los.map((l) => [l.losBucket, l.roomNights]) : []);

    const periodId = await prisma.$transaction(async (tx) => {
      // Atomic find-or-create: two concurrent first pushes for a new period
      // (e.g. the MTD + YTD pulls fired together) would otherwise race on the
      // unique (propertyId, period). Re-check FINAL inside the tx too.
      const period = await tx.reportPeriod.upsert({
        where: { propertyId_period: { propertyId: property.id, period: date } },
        create: { propertyId: property.id, period: date, status: "DRAFT" },
        update: {},
        select: { id: true, status: true },
      });
      if (period.status === "FINAL") throw new FinalLockError();

      // Nationality — replace just this scope's rows.
      await tx.nationalityProduction.deleteMany({ where: { periodId: period.id, scope } });
      await tx.nationalityProduction.createMany({
        data: compiled.nationality.map((n) => ({
          periodId: period.id,
          scope,
          countryCode: n.countryCode,
          countryName: n.countryName,
          roomNights: n.roomNights,
          guests: n.guests,
          roomNightsLastYear: lyNatByKey.get(natKey(n))?.roomNights ?? null,
        })),
      });

      // Length of stay — stored once per period, from the MTD pull. Only
      // replace it when this pull actually carries LOS data, so a dateless
      // correction push (nationality only, no nights) can't wipe a good
      // distribution stored by an earlier dated push.
      if (scope === "MTD" && compiled.los.length > 0) {
        await tx.lengthOfStay.deleteMany({ where: { periodId: period.id } });
        await tx.lengthOfStay.createMany({
          data: compiled.los.map((l) => ({
            periodId: period.id,
            losBucket: l.losBucket,
            bookings: l.bookings,
            roomNights: l.roomNights,
            lastYearRoomNights: lyLosByBucket.get(l.losBucket) ?? null,
          })),
        });
      }

      await tx.importHistory.create({
        data: {
          propertyId: property.id,
          period: date,
          fileName: `VHP Arrival Guest (${scope}) — ${input.source ?? "api"}`,
          uploadedBy: input.uploadedBy ?? null,
          rowCounts:
            scope === "MTD"
              ? { NATIONALITY: compiled.nationality.length, LOS: compiled.los.length }
              : { NATIONALITY: compiled.nationality.length },
        },
      });
      return period.id;
    });

    await logAudit("sales_guest_arrivals_import", code, {
      period: input.period,
      scope,
      nationalities: compiled.nationality.length,
      losBuckets: scope === "MTD" ? compiled.los.length : 0,
      roomNights: compiled.totals.roomNights,
      skipped: compiled.totals.skipped,
      lastYear: ly ? ly.totals.roomNights : null,
      source: input.source ?? null,
    }).catch(() => {});

    const losNote = scope === "MTD" ? `, ${compiled.los.length} LOS bucket(s)` : "";
    const skipNote = compiled.totals.skipped > 0 ? ` (skipped ${compiled.totals.skipped} invalid)` : "";
    return {
      status: 200,
      body: {
        ok: true,
        property: code,
        period: input.period,
        periodId,
        scope,
        nationalities: compiled.nationality.length,
        losBuckets: scope === "MTD" ? compiled.los.length : 0,
        roomNights: compiled.totals.roomNights,
        guests: compiled.totals.guests,
        skipped: compiled.totals.skipped,
        message: `Guests stored (${scope}) — ${compiled.nationality.length} nationality row(s)${losNote} for ${input.period}${skipNote}.`,
      },
    };
  } catch (e) {
    if (e instanceof FinalLockError) return fail(409, FINAL_MSG);
    return fail(500, e instanceof Error ? e.message : "guest arrivals import failed.");
  }
}
