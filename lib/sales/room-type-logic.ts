/**
 * Pure normalisation for the VHP Room Type feed — no DB/auth, so it unit-tests
 * cleanly. Coerces the scraper's numbers, derives ADR when missing, and merges
 * duplicate room types. Actuals only (the report carries no budget).
 *
 * Source: VHP "Forecast Room by Room Type" report
 * (https://e1-vhp.com/fr/report/forecast-room-by-room-type).
 */

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export interface RawRoomTypeRow {
  roomType?: unknown;
  roomTypeName?: unknown;
  name?: unknown;
  roomNights?: unknown;
  rn?: unknown;
  adr?: unknown;
  revenue?: unknown;
}

export interface NormalRoomTypeRow {
  roomTypeName: string;
  roomNights: number;
  adr: number;
  revenue: number;
}

export interface RoomTypeNormalizeResult {
  rows: NormalRoomTypeRow[];
  skipped: number;
  merged: number;
}

/**
 * Normalise the scraper's room-type rows: coerce numbers, merge duplicates
 * (sum room nights + revenue), and derive ADR = revenue / room-nights when it's
 * missing or inconsistent after a merge. Rows with no name or negative/
 * non-numeric figures are skipped. Sorted by revenue desc.
 */
export function normalizeRoomTypeRows(raw: RawRoomTypeRow[]): RoomTypeNormalizeResult {
  const byKey = new Map<string, NormalRoomTypeRow>();
  let skipped = 0;
  let merged = 0;

  for (const r of raw) {
    const name = String(r.roomTypeName ?? r.roomType ?? r.name ?? "").trim();
    const rn = num(r.roomNights ?? r.rn);
    const rev = num(r.revenue);
    const adrIn = num(r.adr);
    if (!name || rn == null || rn < 0 || rev == null || rev < 0) {
      skipped += 1;
      continue;
    }
    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.roomNights += Math.round(rn);
      existing.revenue += rev;
      merged += 1;
    } else {
      byKey.set(key, { roomTypeName: name, roomNights: Math.round(rn), adr: adrIn != null && adrIn >= 0 ? adrIn : 0, revenue: rev });
    }
  }

  // Derive/repair ADR from revenue ÷ room-nights (always, so a merged row is
  // consistent and a missing ADR is filled).
  for (const row of byKey.values()) {
    if (row.roomNights > 0) row.adr = row.revenue / row.roomNights;
  }

  const rows = [...byKey.values()].sort((a, b) => b.revenue - a.revenue);
  return { rows, skipped, merged };
}
