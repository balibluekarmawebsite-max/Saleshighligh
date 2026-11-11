/**
 * Pure helpers for turning VHP room CODES (e.g. "1BPVL", "2BPVLCO") into the
 * readable room NAMES shown in the report. No DB/auth here, so it unit-tests
 * cleanly; the saved code→name rules live in room-type-name-rules.ts.
 *
 * Resolution is applied at READ time in lib/dashboard-data.ts, so renaming a
 * code re-labels every existing period without re-scraping. Two codes that
 * resolve to the SAME name are merged into one report row (sum room nights +
 * revenue, recompute ADR) — this is how an admin collapses rate-code variants
 * (e.g. a complimentary "…CO" code) into a single room type.
 */

/** Lookup key: upper-cased, whitespace-stripped room code. */
export function normalizeRoomCode(code: string): string {
  return String(code ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export interface RawRoomTypeAggRow {
  /** The raw room code / name as stored (a VHP code, or already a name). */
  code: string;
  roomNights: number;
  adr: number;
  revenue: number;
}

export interface ResolvedRoomTypeRow {
  /** Display name: the saved rule's name, else the raw code unchanged. */
  roomTypeName: string;
  /** Underlying raw code(s); joined with " + " when several merged into one. */
  roomCode: string;
  roomNights: number;
  adr: number;
  revenue: number;
}

/**
 * Resolve each raw row's display name via the code→name map, merge rows that
 * resolve to the same display name, and sort by revenue desc. A single
 * (unmerged) row keeps its stored ADR exactly; a merged row recomputes
 * ADR = revenue / room-nights so it stays consistent.
 */
export function resolveRoomTypeNames(
  rows: RawRoomTypeAggRow[],
  nameByCode: Map<string, string>,
): ResolvedRoomTypeRow[] {
  interface Group {
    roomTypeName: string;
    codes: string[];
    roomNights: number;
    revenue: number;
    adr: number;
    sources: number;
  }
  const byName = new Map<string, Group>();

  for (const r of rows) {
    const rawCode = String(r.code ?? "").trim();
    const mapped = nameByCode.get(normalizeRoomCode(rawCode));
    const displayName = (mapped && mapped.trim()) || rawCode;
    const key = displayName.toLowerCase();
    const nights = Number.isFinite(r.roomNights) ? r.roomNights : 0;
    const revenue = Number.isFinite(r.revenue) ? r.revenue : 0;
    const adr = Number.isFinite(r.adr) ? r.adr : 0;

    const g = byName.get(key);
    if (g) {
      g.roomNights += nights;
      g.revenue += revenue;
      if (rawCode && !g.codes.includes(rawCode)) g.codes.push(rawCode);
      g.sources += 1;
    } else {
      byName.set(key, {
        roomTypeName: displayName,
        codes: rawCode ? [rawCode] : [],
        roomNights: nights,
        revenue,
        adr,
        sources: 1,
      });
    }
  }

  return [...byName.values()]
    .map((g) => ({
      roomTypeName: g.roomTypeName,
      roomCode: g.codes.join(" + "),
      roomNights: g.roomNights,
      // Merged rows recompute ADR; a lone row keeps its stored ADR.
      adr: g.sources > 1 ? (g.roomNights > 0 ? g.revenue / g.roomNights : 0) : g.adr,
      revenue: g.revenue,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}
