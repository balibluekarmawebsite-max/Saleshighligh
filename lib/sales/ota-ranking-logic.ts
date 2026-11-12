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

/** Integer parse for rank/total: keep digits only, so "#3", "1,248" and the
 * Indonesian "1.248" all read as the whole number (1248), never a fraction. */
const intNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  const s = String(v ?? "").replace(/[^\d]/g, "");
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
};

/** Decimal parse for rating: accept a comma OR dot decimal ("9,1" or "9.1"),
 * drop stray characters, keep a single decimal point. */
const decNum = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim().replace(/,/g, ".").replace(/[^\d.]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  if (!s || s === ".") return null;
  const n = parseFloat(s);
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
    if (r == null || typeof r !== "object") {
      skipped += 1;
      continue;
    }
    const platform = normalizeRankingPlatform(r.platform);
    const rank = intNum(r.rank);
    if (!platform || rank == null || rank <= 0) {
      skipped += 1;
      continue;
    }
    const total = intNum(r.totalInMarket ?? r.total);
    const rating = decNum(r.rating);
    byPlatform.set(platform, {
      platform,
      rank,
      totalInMarket: total != null && total > 0 ? total : null,
      // Ratings are 0–5 (Tripadvisor) or 0–10 (Booking/Expedia). Keep a sane
      // positive value (≤10, the stored column's range), else null.
      rating: rating != null && rating > 0 && rating <= 10 ? rating : null,
    });
  }

  // Deterministic order (BOOKING, EXPEDIA, TRIPADVISOR).
  const rows = RANKING_PLATFORMS.map((p) => byPlatform.get(p)).filter((r): r is NormalRankingRow => !!r);
  return { rows, skipped };
}
