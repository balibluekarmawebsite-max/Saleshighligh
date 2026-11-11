/**
 * Pure compiler for the VHP "Arrival Guest" raw feed. The scraper sends one row
 * per arrival/reservation; this turns them into the two aggregates the Guests
 * page stores: nationality room-nights (for the table, flags and choropleth) and
 * the length-of-stay distribution. No DB/auth here, so it unit-tests cleanly.
 *
 * Source: VHP "Arrival Guest" report
 * (https://e1-vhp.com/fr/report/arrival-guest).
 */

import { resolveCountry } from "@/lib/sales/countries";

export const LOS_ORDER = ["1", "2", "3", "4", "5", "6", "7+"] as const;

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Parse a YYYY-MM-DD (or ISO) date to a UTC epoch-ms, else null. */
function parseDate(v: unknown): number | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export interface RawArrival {
  country?: unknown;
  countryName?: unknown;
  nationality?: unknown;
  countryCode?: unknown;
  arrival?: unknown;
  checkIn?: unknown;
  arrivalDate?: unknown;
  departure?: unknown;
  checkOut?: unknown;
  departureDate?: unknown;
  nights?: unknown;
  los?: unknown;
  lengthOfStay?: unknown;
  rooms?: unknown;
  roomCount?: unknown;
  roomNights?: unknown;
  guests?: unknown;
  pax?: unknown;
}

export interface NationalityAgg {
  countryCode: string | null;
  countryName: string;
  roomNights: number;
  /** null when no guest/pax figure was supplied for this country. */
  guests: number | null;
}

export interface LosAgg {
  losBucket: string;
  bookings: number;
  roomNights: number;
}

export interface GuestCompileResult {
  nationality: NationalityAgg[];
  los: LosAgg[];
  totals: { arrivals: number; roomNights: number; guests: number | null; skipped: number };
}

/** Length-of-stay bucket for a positive integer night count. */
export function losBucket(nights: number): string {
  const n = Math.max(1, Math.round(nights));
  return n >= 7 ? "7+" : String(n);
}

/** Mean length of stay (nights per booking) from a LOS distribution, derived
 * from the bucket LABEL weighted by booking count — not room-nights, which
 * over-counts multi-room reservations. "7+" is taken as 7. Null if no bookings. */
export function averageLosNights(buckets: { losBucket: string; bookings: number }[]): number | null {
  const nights = (b: string) => (b === "7+" ? 7 : Number(b) || 0);
  const totalBookings = buckets.reduce((s, b) => s + b.bookings, 0);
  if (totalBookings <= 0) return null;
  const stayNights = buckets.reduce((s, b) => s + nights(b.losBucket) * b.bookings, 0);
  return stayNights / totalBookings;
}

/** Derive length-of-stay (nights) from an arrival row: explicit nights, else
 * departure − arrival. Returns null if neither is usable. */
function nightsOf(r: RawArrival): number | null {
  const explicit = num(r.nights ?? r.los ?? r.lengthOfStay);
  if (explicit != null && explicit >= 1) return Math.round(explicit);
  const a = parseDate(r.arrival ?? r.checkIn ?? r.arrivalDate);
  const d = parseDate(r.departure ?? r.checkOut ?? r.departureDate);
  if (a != null && d != null) {
    const diff = Math.round((d - a) / 86_400_000);
    if (diff >= 1) return diff;
  }
  return null;
}

/** Compile raw arrivals into nationality room-nights + a LOS distribution. */
export function compileGuestArrivals(rows: RawArrival[]): GuestCompileResult {
  interface NatAcc {
    countryCode: string | null;
    countryName: string;
    roomNights: number;
    guests: number;
    guestsKnown: boolean;
  }
  const nat = new Map<string, NatAcc>();
  const los = new Map<string, LosAgg>();
  let arrivals = 0;
  let skipped = 0;
  let totalGuests = 0;
  let guestsKnown = false;

  for (const r of rows ?? []) {
    // A null/undefined/primitive element is one skipped row, not a crash.
    if (r == null || typeof r !== "object") {
      skipped += 1;
      continue;
    }
    const rawCountry = String(r.countryCode ?? r.country ?? r.countryName ?? r.nationality ?? "").trim();
    if (!rawCountry) {
      skipped += 1;
      continue;
    }
    const nights = nightsOf(r);
    const rooms = Math.max(1, Math.round(num(r.rooms ?? r.roomCount) ?? 1));
    const explicitRN = num(r.roomNights);
    let roomNights: number;
    if (explicitRN != null && explicitRN >= 0) roomNights = Math.round(explicitRN);
    else if (nights != null) roomNights = nights * rooms;
    else {
      skipped += 1;
      continue;
    }

    const resolved = resolveCountry(rawCountry);
    const key = resolved.code ? `C:${resolved.code}` : `N:${resolved.name.toLowerCase()}`;
    const g = num(r.guests ?? r.pax);

    const acc = nat.get(key);
    if (acc) {
      acc.roomNights += roomNights;
      if (g != null && g >= 0) {
        acc.guests += Math.round(g);
        acc.guestsKnown = true;
      }
    } else {
      nat.set(key, {
        countryCode: resolved.code,
        countryName: resolved.name,
        roomNights,
        guests: g != null && g >= 0 ? Math.round(g) : 0,
        guestsKnown: g != null && g >= 0,
      });
    }
    if (g != null && g >= 0) {
      totalGuests += Math.round(g);
      guestsKnown = true;
    }

    // Length of stay only when we actually know the night count.
    if (nights != null) {
      const bucket = losBucket(nights);
      const l = los.get(bucket);
      if (l) {
        l.bookings += 1;
        l.roomNights += roomNights;
      } else {
        los.set(bucket, { losBucket: bucket, bookings: 1, roomNights });
      }
    }
    arrivals += 1;
  }

  const nationality: NationalityAgg[] = [...nat.values()]
    .map((a) => ({
      countryCode: a.countryCode,
      countryName: a.countryName,
      roomNights: a.roomNights,
      guests: a.guestsKnown ? a.guests : null,
    }))
    .sort((a, b) => b.roomNights - a.roomNights);

  const losRows: LosAgg[] = [...los.values()].sort(
    (a, b) => LOS_ORDER.indexOf(a.losBucket as (typeof LOS_ORDER)[number]) -
      LOS_ORDER.indexOf(b.losBucket as (typeof LOS_ORDER)[number]),
  );

  const totalRoomNights = nationality.reduce((s, n) => s + n.roomNights, 0);
  return {
    nationality,
    los: losRows,
    totals: { arrivals, roomNights: totalRoomNights, guests: guestsKnown ? totalGuests : null, skipped },
  };
}
