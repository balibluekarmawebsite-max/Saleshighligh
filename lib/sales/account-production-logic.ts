/**
 * Pure normalisation for the VHP Account Production (YTD) feed — no DB/auth, so
 * it unit-tests cleanly. Coerces the scraper's numbers and merges duplicate
 * accounts; the SEGMENT is resolved separately (lib/sales/account-segments.ts +
 * the saved rules), so this stays rule-agnostic and keeps only the raw type the
 * scraper sent as a hint.
 *
 * Source: VHP "Forecast Room Production" report
 * (https://e1-vhp.com/fr/report/forecast-room-production), pulled year-to-date.
 */

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};

export interface RawAccountRow {
  account?: unknown;
  accountName?: unknown;
  type?: unknown;
  accountType?: unknown;
  roomNights?: unknown;
  revenue?: unknown;
}

export interface NormalAccountRow {
  accountName: string;
  /** The segment/type string the scraper sent, if any (resolved later). */
  typeHint: string | null;
  roomNights: number;
  revenue: number;
}

export interface NormalizeResult {
  rows: NormalAccountRow[];
  skipped: number; // dropped (no name / bad numbers)
  merged: number; // duplicate account rows folded together
}

/**
 * Normalise the scraper's account rows: coerce numbers, keep the sent type as a
 * hint, and merge duplicate accounts by summing (the model is unique per
 * (period, accountName)). Rows with no name or a negative/non-numeric
 * room-night/revenue are skipped. Sorted by revenue desc.
 */
export function normalizeAccountRows(raw: RawAccountRow[]): NormalizeResult {
  const byKey = new Map<string, NormalAccountRow>();
  let skipped = 0;
  let merged = 0;

  for (const r of raw) {
    const name = String(r.accountName ?? r.account ?? "").trim();
    const rn = num(r.roomNights);
    const rev = num(r.revenue);
    if (!name || rn == null || rn < 0 || rev == null || rev < 0) {
      skipped += 1;
      continue;
    }
    const hintRaw = r.accountType ?? r.type;
    const typeHint = hintRaw != null && String(hintRaw).trim() ? String(hintRaw).trim() : null;
    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.roomNights += Math.round(rn);
      existing.revenue += rev;
      if (!existing.typeHint && typeHint) existing.typeHint = typeHint;
      merged += 1;
    } else {
      byKey.set(key, { accountName: name, typeHint, roomNights: Math.round(rn), revenue: rev });
    }
  }

  const rows = [...byKey.values()].sort((a, b) => b.revenue - a.revenue);
  return { rows, skipped, merged };
}
