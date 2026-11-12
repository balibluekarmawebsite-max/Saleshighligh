/**
 * Pure helpers for the OTA Ranking Tracker. Normalises ranking rows (from a
 * manual form or an AI extraction) into the three tracked platforms. No DB/auth,
 * so it unit-tests cleanly. Each (property, period) stores one rank per
 * platform; the history across periods is the "track record".
 */

export const RANKING_PLATFORMS = ["BOOKING", "EXPEDIA", "TRIPADVISOR"] as const;
export type RankingPlatform = (typeof RANKING_PLATFORMS)[number];

export const RANKING_PLATFORM_LABEL: Record<RankingPlatform, string> = {
  BOOKING: "Booking.com",
  EXPEDIA: "Expedia",
  TRIPADVISOR: "Tripadvisor",
};

export interface RawRankingRow {
  platform?: unknown;
  rank?: unknown;
  totalInMarket?: unknown;
  total?: unknown;
  rating?: unknown;
}

export interface NormalRankingRow {
  platform: RankingPlatform;
  rank: number;
  totalInMarket: number | null;
  rating: number | null;
}

const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s#]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Map a free-text platform name to the enum, else null. */
export function normalizeRankingPlatform(input: unknown): RankingPlatform | null {
  const s = String(input ?? "").toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s.includes("booking")) return "BOOKING";
  if (s.includes("expedia")) return "EXPEDIA";
  if (s.includes("tripadvisor") || s.includes("tripad") || s === "ta") return "TRIPADVISOR";
  return null;
}

export interface RankingNormalizeResult {
  rows: NormalRankingRow[];
  skipped: number;
}

/** Normalise ranking rows: resolve the platform, require a positive rank, keep
 * the last row seen per platform (a later correction wins), drop the rest. */
export function normalizeRankings(raw: RawRankingRow[]): RankingNormalizeResult {
  const byPlatform = new Map<RankingPlatform, NormalRankingRow>();
  let skipped = 0;

  for (const r of raw ?? []) {
    const platform = normalizeRankingPlatform(r.platform);
    const rank = num(r.rank);
    if (!platform || rank == null || rank <= 0) {
      skipped += 1;
      continue;
    }
    const total = num(r.totalInMarket ?? r.total);
    const rating = num(r.rating);
    byPlatform.set(platform, {
      platform,
      rank: Math.round(rank),
      totalInMarket: total != null && total > 0 ? Math.round(total) : null,
      // Ratings are 0–5 (or 0–10); keep a sane positive value, else null.
      rating: rating != null && rating > 0 && rating <= 10 ? rating : null,
    });
  }

  // Deterministic order (BOOKING, EXPEDIA, TRIPADVISOR).
  const rows = RANKING_PLATFORMS.map((p) => byPlatform.get(p)).filter((r): r is NormalRankingRow => !!r);
  return { rows, skipped };
}
