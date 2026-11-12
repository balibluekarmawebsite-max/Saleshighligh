/**
 * Persist OTA ranking rows (Booking.com / Expedia / Tripadvisor) for one
 * (property, period). Each save is one recorded month; the history across
 * periods is the track record the 12-month trend reads. Find-or-create the
 * period (FINAL locked), upsert PlatformRanking per platform, audit.
 */

import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normalizeRankings, type RawRankingRow } from "@/lib/sales/ota-ranking-logic";

const PERIOD_RE = /^\d{4}-\d{2}$/;

class FinalLockError extends Error {}
const FINAL_MSG = "This report period is marked FINAL and is locked for editing.";

export interface OtaRankingImportInput {
  property: string;
  period: string; // YYYY-MM
  rankings: RawRankingRow[];
  source?: string;
  uploadedBy?: string | null;
}

export interface OtaRankingResult {
  ok: boolean;
  message: string;
  saved?: number;
}

function periodDate(period: string): Date | null {
  if (!PERIOD_RE.test(period)) return null;
  const d = new Date(`${period}-01T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 7) === period ? d : null;
}

export async function saveOtaRankings(input: OtaRankingImportInput): Promise<OtaRankingResult> {
  try {
    const code = String(input.property ?? "").trim().toUpperCase();
    if (!code) return { ok: false, message: "property is required." };
    const date = periodDate(String(input.period ?? "").trim());
    if (!date) return { ok: false, message: "period must be a real month in YYYY-MM form." };

    const { rows } = normalizeRankings(input.rankings ?? []);
    if (rows.length === 0) return { ok: false, message: "No valid ranking rows (need a platform + positive rank)." };

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

      for (const r of rows) {
        // On update, only overwrite the rating when a new one was supplied — a
        // blank rating field must not wipe a previously-stored score.
        const update: { rank: number; totalInMarket: number | null; rating?: number } = {
          rank: r.rank,
          totalInMarket: r.totalInMarket,
        };
        if (r.rating != null) update.rating = r.rating;
        await tx.platformRanking.upsert({
          where: { periodId_platform: { periodId: period.id, platform: r.platform } },
          create: {
            periodId: period.id,
            platform: r.platform,
            rank: r.rank,
            totalInMarket: r.totalInMarket,
            rating: r.rating,
          },
          update,
        });
      }
    });

    await logAudit("sales_ota_ranking_save", code, {
      period: input.period,
      platforms: rows.map((r) => r.platform),
      source: input.source ?? null,
    }).catch(() => {});

    return { ok: true, saved: rows.length, message: `OTA ranking saved — ${rows.length} platform(s) for ${input.period}.` };
  } catch (e) {
    if (e instanceof FinalLockError) return { ok: false, message: FINAL_MSG };
    return { ok: false, message: e instanceof Error ? e.message : "could not save the ranking." };
  }
}
