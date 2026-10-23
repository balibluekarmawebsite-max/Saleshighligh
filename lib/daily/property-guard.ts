/**
 * Guard against a pickup file POSTed under the wrong property code.
 *
 * The VHP *Yearly Forecast Of Room Occupancy* export is identical in shape for
 * every property, so the dashboard can't tell BKDS's file from BKDU's by format
 * alone — it trusts the `property=` field on the upload. But the export's
 * "Saleable Rooms" row is the property's full inventory (rooms × days in the
 * month), so the implied room count is a reliable fingerprint: BKV=15, BKDS=18,
 * BKDU=20. If the file's implied rooms clearly disagree with the property it was
 * posted as, the scraper has swapped two properties' files — reject it before it
 * overwrites the wrong report.
 *
 * Pure (depends only on the static property table) so it's unit-testable and
 * safe to import anywhere.
 */

import { PROPERTIES, PROPERTY_BY_CODE, type PropertyCode } from "@/lib/constants";

/** Days in a 1-indexed (year, month), via the 0th day of the next month. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export interface SaleableSample {
  stayYear: number;
  stayMonth: number; // 1-12
  saleableRooms: number | null;
}

/**
 * Returns an error message when a pickup file's implied room count clearly
 * disagrees with the property it was posted as (off by more than 1 room), else
 * null. Skips silently when the property is unknown or the file carries no
 * saleable-rooms figure to check against. The ±1 tolerance absorbs the odd
 * out-of-order room while still separating 15 / 18 / 20 cleanly.
 */
export function wrongPropertyError(propertyCode: string, rows: SaleableSample[]): string | null {
  const expected = PROPERTY_BY_CODE[propertyCode as PropertyCode]?.roomCount;
  if (!expected) return null; // unknown property — caller rejects that separately

  const sample = rows.find((r) => (r.saleableRooms ?? 0) > 0);
  if (!sample || !sample.saleableRooms) return null; // nothing to fingerprint

  const inferred = Math.round(sample.saleableRooms / daysInMonth(sample.stayYear, sample.stayMonth));
  if (Math.abs(inferred - expected) <= 1) return null; // matches this property

  const looksLike = PROPERTIES.find((p) => Math.abs(p.roomCount - inferred) <= 1);
  const who = looksLike ? `${looksLike.code} (${looksLike.roomCount} rooms)` : `~${inferred} rooms`;
  return `This file's saleable rooms imply ${who}, but it was posted as ${propertyCode} (${expected} rooms). Check the property code on the upload.`;
}
