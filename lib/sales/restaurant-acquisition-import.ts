/**
 * Persist Restaurant "Acquisition Split" data for one (property, period):
 *   - channel rows → FnbAcquisition (free-text channel, booking/cover ratios)
 *   - daily rows   → FnbAcquisitionDaily (day, bookings, covers)
 * Each dimension is replaced only when it is actually submitted (a non-empty
 * set), so saving channels never wipes the daily series and vice-versa. Within a
 * submitted dimension the set is authoritative — rows no longer present are
 * pruned. Find-or-create the period (FINAL locked), audit.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  normalizeChannelRows,
  normalizeDailyRows,
  type RawChannelRow,
  type RawDailyRow,
} from "@/lib/sales/restaurant-acquisition-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface AcquisitionImportInput {
  property: string;
  period: string; // YYYY-MM
  channels?: RawChannelRow[];
  daily?: RawDailyRow[];
  source?: string;
  uploadedBy?: string | null;
}

export interface AcquisitionResult {
  ok: boolean;
  message: string;
  savedChannels?: number;
  savedDaily?: number;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveAcquisition(input: AcquisitionImportInput): Promise<AcquisitionResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const { rows: channels } = normalizeChannelRows(input.channels ?? []);
    const { rows: daily } = normalizeDailyRows(input.daily ?? []);
    if (channels.length === 0 && daily.length === 0) {
      return { ok: false, message: "Nothing to save — add channels (name + booking % + cover %) or daily rows." };
    }

    const property = await prisma.property.findUnique({ where: { code }, select: { id: true } });
    if (!property) return { ok: false, message: `unknown property "${code}".` };

    await prisma.$transaction(async (tx) => {
      const period = await tx.reportPeriod.upsert({
        where: { propertyId_period: { propertyId: property.id, period: date } },
        create: { propertyId: property.id, period: date, status: "DRAFT" },
        update: {},
        select: { id: true, status: true },
      });
      if (period.status === "FINAL") throw new FinalLockError();

      // Channels — replace the set only when channels were submitted.
      if (channels.length > 0) {
        await tx.fnbAcquisition.deleteMany({
          where: { periodId: period.id, channel: { notIn: channels.map((c) => c.channel) } },
        });
        for (const c of channels) {
          await tx.fnbAcquisition.upsert({
            where: { periodId_channel: { periodId: period.id, channel: c.channel } },
            create: { periodId: period.id, channel: c.channel, bookingsPct: c.bookingsPct, coversPct: c.coversPct },
            update: { bookingsPct: c.bookingsPct, coversPct: c.coversPct },
          });
        }
      }

      // Daily — replace the set only when daily rows were submitted.
      if (daily.length > 0) {
        await tx.fnbAcquisitionDaily.deleteMany({
          where: { periodId: period.id, day: { notIn: daily.map((d) => d.day) } },
        });
        for (const d of daily) {
          await tx.fnbAcquisitionDaily.upsert({
            where: { periodId_day: { periodId: period.id, day: d.day } },
            create: { periodId: period.id, day: d.day, bookings: d.bookings, covers: d.covers },
            update: { bookings: d.bookings, covers: d.covers },
          });
        }
      }
    });

    await logAudit("sales_restaurant_acquisition_save", code, {
      period: input.period,
      channels: channels.map((c) => c.channel),
      dailyDays: daily.length,
      source: input.source ?? null,
    }).catch(() => {});

    const parts: string[] = [];
    if (channels.length > 0) parts.push(`${channels.length} channel(s)`);
    if (daily.length > 0) parts.push(`${daily.length} day(s)`);
    return {
      ok: true,
      savedChannels: channels.length,
      savedDaily: daily.length,
      message: `Acquisition split saved — ${parts.join(" + ")} for ${input.period}.`,
    };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save acquisition split." };
  }
}
