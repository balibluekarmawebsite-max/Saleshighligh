/**
 * Pure parsing + classification for the VHP Account Production (YTD) feed — no
 * DB/auth imports, so it unit-tests cleanly. The importer (account-production-
 * import.ts) does the I/O; this normalises the scraper's rows and fills in the
 * account type when the scraper doesn't send one.
 *
 * Source: VHP "Forecast Room Production" report
 * (https://e1-vhp.com/fr/report/forecast-room-production), pulled year-to-date
 * (Jan 1 → the report month's end).
 */

export type AccountType = "OTA" | "TA" | "CORPORATE" | "WHOLESALER";
export const ACCOUNT_TYPES: readonly AccountType[] = ["OTA", "TA", "CORPORATE", "WHOLESALER"] as const;

// Name hints for classifying an account when the scraper doesn't send a type.
// Wholesalers are checked first (some bed-banks read like OTAs).
const WHOLESALER_HINTS = [
  "hotelbeds", "g2 travel", "mg holiday", "webbeds", "gta", "miki", "tourico", "jtb",
  "dida", "hotelspro", "w2m", "juniper", "roomsxml", "stuba", "bonotel", "darina",
];
const OTA_HINTS = [
  "booking", "expedia", "agoda", "klook", "traveloka", "trip.com", "tripcom", "ctrip",
  "airbnb", "hotels.com", "tiket", "pegipegi", "mister aladin", "ostrovok", "despegar",
];
const CORPORATE_HINTS = ["corporate", "company", "ministry", "embassy", "government", "gov ", "pt.", "cv."];

/** Classify an account by name (fallback when the scraper omits the type). */
export function classifyAccountType(name: string): AccountType {
  const n = name.trim().toLowerCase();
  if (WHOLESALER_HINTS.some((h) => n.includes(h))) return "WHOLESALER";
  if (OTA_HINTS.some((h) => n.includes(h))) return "OTA";
  if (CORPORATE_HINTS.some((h) => n.includes(h))) return "CORPORATE";
  return "TA"; // default: treat an unknown booker as a travel agent
}

/** Parse a scraper-supplied type string into the enum, or null if unrecognised. */
export function parseAccountType(raw: unknown): AccountType | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "ota") return "OTA";
  if (s === "ta" || s === "travel agent" || s === "travelagent") return "TA";
  if (s === "corporate" || s === "corp") return "CORPORATE";
  if (s === "wholesaler" || s === "wholesale" || s === "bedbank" || s === "bed bank") return "WHOLESALER";
  return null;
}

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
  accountType: AccountType;
  roomNights: number;
  revenue: number;
}

export interface NormalizeResult {
  rows: NormalAccountRow[];
  skipped: number; // rows dropped (no name / bad numbers)
  classified: number; // rows whose type we had to infer
  merged: number; // duplicate account rows folded together
}

/**
 * Normalise the scraper's account rows: coerce numbers, resolve the type
 * (scraper value wins, else classify by name), and merge duplicate accounts by
 * summing (the model is unique per (period, accountName)). Rows with no name or
 * a negative/non-numeric room-night/revenue are skipped.
 */
export function normalizeAccountRows(raw: RawAccountRow[]): NormalizeResult {
  const byKey = new Map<string, NormalAccountRow>();
  let skipped = 0;
  let classified = 0;
  let merged = 0;

  for (const r of raw) {
    const name = String(r.accountName ?? r.account ?? "").trim();
    const rn = num(r.roomNights);
    const rev = num(r.revenue);
    if (!name || rn == null || rn < 0 || rev == null || rev < 0) {
      skipped += 1;
      continue;
    }
    let type = parseAccountType(r.accountType ?? r.type);
    if (!type) {
      type = classifyAccountType(name);
      classified += 1;
    }
    const key = name.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      existing.roomNights += Math.round(rn);
      existing.revenue += rev;
      merged += 1;
    } else {
      byKey.set(key, { accountName: name, accountType: type, roomNights: Math.round(rn), revenue: rev });
    }
  }

  // Newest-first by revenue, so the stored order matches the dashboard's Pareto.
  const rows = [...byKey.values()].sort((a, b) => b.revenue - a.revenue);
  return { rows, skipped, classified, merged };
}
