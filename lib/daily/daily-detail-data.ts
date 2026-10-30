/**
 * Assembles the detailed per-property block of the daily email (matching the
 * team's long-form report): yesterday's pickup total + by agent (OTA/Offline vs
 * Direct), yesterday's cancellation total + by agent, occupancy on hand for the
 * next few months, and Previous-Day / Today / Tomorrow arrivals & departures.
 *
 * Pulls the new Reservation/Departure feeds plus the existing cancellation +
 * pickup-snapshot data; every piece is null/empty-safe so the email renders even
 * before a given feed has sent anything.
 */

import { cancellationLineRoomNights, isSameDayCancellation, occupancyPct } from "@/lib/daily/calculations";
import { PROPERTIES, PROPERTY_BY_CODE, type PropertyCode } from "@/lib/constants";
import { classifyChannel } from "@/lib/weekly/owner-channel-mix";
import { prisma } from "@/lib/prisma";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isoOf = (d: Date): string => d.toISOString().slice(0, 10);
const toUtc = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, (d ?? 1) + days)).toISOString().slice(0, 10);
}

export interface AgentRN {
  agent: string;
  rn: number;
}
export interface OnHandMonth {
  label: string; // "Oct"
  pct: number | null;
}
export interface FlowDay {
  heading: string; // "Previous Day Oct 29th, 2026" / "Today" / "Tomorrow"
  arrival: number | null;
  departure: number | null;
}
export interface PropertyDetail {
  code: string;
  name: string;
  roomCount: number;
  refDate: string | null; // the "yesterday" the figures describe
  pickupTotal: number;
  cancelTotal: number;
  onHand: OnHandMonth[];
  pickupOtaOffline: AgentRN[];
  pickupDirect: AgentRN[];
  cancelByAgent: AgentRN[];
  flow: FlowDay[];
}

/** "29th October 2026" style label from an ISO date. */
function prettyLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const suffix = d! % 10 === 1 && d !== 11 ? "st" : d! % 10 === 2 && d !== 12 ? "nd" : d! % 10 === 3 && d !== 13 ? "rd" : "th";
  return `${d}${suffix} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

async function latestOnHand(propertyId: string, count = 3): Promise<OnHandMonth[]> {
  const snap = await prisma.dailyPickupSnapshot.findFirst({
    where: { propertyId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  if (!snap) return [];
  const rows = await prisma.dailyPickupSnapshot.findMany({
    where: { propertyId, snapshotDate: snap.snapshotDate },
    orderBy: [{ stayYear: "asc" }, { stayMonth: "asc" }],
    select: { stayYear: true, stayMonth: true, roomNights: true, saleableRooms: true },
  });
  const snapIdx = snap.snapshotDate.getUTCFullYear() * 12 + snap.snapshotDate.getUTCMonth();
  return rows
    .filter((r) => r.stayYear * 12 + (r.stayMonth - 1) >= snapIdx)
    .slice(0, count)
    .map((r) => ({ label: MONTHS[r.stayMonth - 1]!, pct: occupancyPct(r.roomNights, r.saleableRooms) }));
}

async function propertyDetail(code: string, name: string, propertyId: string): Promise<PropertyDetail> {
  const roomCount = PROPERTY_BY_CODE[code as PropertyCode]?.roomCount ?? 0;

  // Report day (D = "yesterday") = the latest occupancy snapshot date — the
  // feeds date it as yesterday's close. Cancellation and the Previous Day /
  // Today / Tomorrow flow all anchor on D, so the flow dates [D, D+1, D+2] line
  // up with the scraper's arrival/departure dates (yesterday/today/tomorrow).
  const snap = await prisma.dailyPickupSnapshot.findFirst({
    where: { propertyId },
    orderBy: { snapshotDate: "desc" },
    select: { snapshotDate: true },
  });
  let refDate: string | null = snap ? isoOf(snap.snapshotDate) : null;

  // Pickup by agent = the LATEST reservation run's rows (the scraper dates them
  // by run day, one ahead of D), split Direct vs OTA/Offline. Decoupled from D.
  const pickupOtaOffline: AgentRN[] = [];
  const pickupDirect: AgentRN[] = [];
  const latestPk = await prisma.dailyReservationPickup.findFirst({
    where: { propertyId },
    orderBy: { pickupDate: "desc" },
    select: { pickupDate: true },
  });
  if (latestPk) {
    if (!refDate) refDate = isoOf(latestPk.pickupDate); // no occupancy yet → fall back
    const pk = await prisma.dailyReservationPickup.findMany({
      where: { propertyId, pickupDate: latestPk.pickupDate },
      orderBy: { roomNights: "desc" },
      select: { agent: true, roomNights: true },
    });
    for (const p of pk) {
      const row = { agent: p.agent, rn: p.roomNights };
      if (classifyChannel(p.agent) === "Direct Booking (Website/Walk In/Group Retreat)") pickupDirect.push(row);
      else pickupOtaOffline.push(row);
    }
  }
  const pickupTotal = [...pickupOtaOffline, ...pickupDirect].reduce((s, p) => s + p.rn, 0);

  // Cancellation by agent for cancelDate = D (excluding same-day book-and-cancel).
  const cancelByAgent: AgentRN[] = [];
  let cancelTotal = 0;
  if (refDate) {
    const cx = await prisma.dailyCancellation.findMany({
      where: { propertyId, cancelDate: toUtc(refDate) },
      select: { cancelDate: true, createdDate: true, nights: true, roomQuantity: true, reservationName: true },
    });
    const agg = new Map<string, number>();
    for (const c of cx) {
      if (isSameDayCancellation({ cancelDate: isoOf(c.cancelDate), createdDate: isoOf(c.createdDate) })) continue;
      const rn = cancellationLineRoomNights({
        cancelDate: isoOf(c.cancelDate),
        createdDate: isoOf(c.createdDate),
        nights: c.nights,
        roomQuantity: c.roomQuantity,
      });
      cancelTotal += rn;
      const agent = (c.reservationName ?? "Other").trim() || "Other";
      agg.set(agent, (agg.get(agent) ?? 0) + rn);
    }
    for (const [agent, rn] of [...agg.entries()].sort((a, b) => b[1] - a[1])) cancelByAgent.push({ agent, rn });
  }

  // Arrivals / departures: Previous Day (D), Today (D+1), Tomorrow (D+2).
  const flow: FlowDay[] = [];
  if (refDate) {
    const days = [refDate, shiftIso(refDate, 1), shiftIso(refDate, 2)];
    const rows = await prisma.dailyArrivalDeparture.findMany({
      where: { propertyId, stayDate: { in: days.map(toUtc) } },
      select: { stayDate: true, arrivalRooms: true, departureRooms: true },
    });
    const byDate = new Map(rows.map((r) => [isoOf(r.stayDate), r]));
    const headings = [`Previous Day ${prettyLong(days[0]!)}`, "Today", "Tomorrow"];
    days.forEach((d, i) => {
      const r = byDate.get(d);
      flow.push({ heading: headings[i]!, arrival: r?.arrivalRooms ?? null, departure: r?.departureRooms ?? null });
    });
  }

  const onHand = await latestOnHand(propertyId);
  return { code, name, roomCount, refDate, pickupTotal, cancelTotal, onHand, pickupOtaOffline, pickupDirect, cancelByAgent, flow };
}

/** The detailed block for ONE property (for the dashboard sections). */
export async function getPropertyDetail(code: string): Promise<PropertyDetail | null> {
  const row = await prisma.property.findUnique({
    where: { code: code.trim().toUpperCase() },
    select: { id: true, code: true, name: true },
  });
  if (!row) return null;
  return propertyDetail(row.code, row.name, row.id);
}

export interface DailyDetailData {
  properties: PropertyDetail[];
  refDate: string | null;
}

/** Build the detailed daily report for every property (in BKDS, BKDU, BKV order). */
export async function buildDailyDetailData(): Promise<DailyDetailData> {
  const props = await prisma.property.findMany({ select: { id: true, code: true, name: true } });
  const byCode = new Map(props.map((p) => [p.code, p]));
  const out: PropertyDetail[] = [];
  for (const info of PROPERTIES) {
    const row = byCode.get(info.code);
    if (!row) continue;
    out.push(await propertyDetail(info.code, info.name, row.id));
  }
  const refDate = out.map((p) => p.refDate).filter((d): d is string => d != null).sort().at(-1) ?? null;
  return { properties: out, refDate };
}
