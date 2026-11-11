/**
 * Account segmentation registry + resolver (pure — no DB/auth, unit-testable).
 *
 * An account (booker) is shown under a SEGMENT. Segments are data-driven here (a
 * plain list, easy to extend) rather than a fixed DB enum, and a saved
 * account→segment rule table (AccountSegmentRule, keyed by account NAME so it
 * applies to every property) overrides the automatic classification. A row whose
 * resolved segment is EXCLUDE is dropped from the report (junk like totals/
 * vouchers). Everything is resolved at READ time, so editing a rule re-segments
 * all properties/periods without re-importing.
 */

export interface SegmentDef {
  code: string;
  label: string;
}

/** The sentinel segment that drops a row from the report entirely. */
export const EXCLUDE_SEGMENT = "EXCLUDE";

/** Canonical segment list + display order. Extend by adding an entry. */
export const SEGMENTS: SegmentDef[] = [
  { code: "OTA", label: "OTA" },
  { code: "TRAVEL_AGENT", label: "Travel Agent" },
  { code: "OVERSEAS_TRAVEL_AGENT", label: "Overseas Travel Agent" },
  { code: "B2B", label: "B2B" },
  { code: "CORPORATE", label: "Corporate" },
  { code: "DIRECT_BOOKING", label: "Direct Booking" },
];

export const SEGMENT_CODES: string[] = SEGMENTS.map((s) => s.code);
export const SEGMENT_LABEL: Record<string, string> = Object.fromEntries(SEGMENTS.map((s) => [s.code, s.label]));
const SEGMENT_INDEX: Record<string, number> = Object.fromEntries(SEGMENTS.map((s, i) => [s.code, i]));

/** Default segment for a booker we can't otherwise place. */
export const DEFAULT_SEGMENT = "TRAVEL_AGENT";

/** The normalised key a rule is stored/looked-up under (stable across casing/spacing). */
export function accountKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Human label for a segment code (falls back to the raw code). */
export function segmentLabel(code: string): string {
  return SEGMENT_LABEL[code] ?? code;
}

/** Order a set of present segment codes by the registry order (unknowns last). */
export function orderSegments(codes: Iterable<string>): string[] {
  return [...new Set(codes)].sort((a, b) => (SEGMENT_INDEX[a] ?? 999) - (SEGMENT_INDEX[b] ?? 999) || a.localeCompare(b));
}

// Name hints for the automatic classifier (fallback when no rule + no type sent).
const B2B_HINTS = [
  "hotelbeds", "g2 travel", "mg holiday", "webbeds", "gta", "miki", "tourico", "jtb",
  "dida", "hotelspro", "w2m", "juniper", "roomsxml", "stuba", "bonotel", "wholesale", "bedbank", "bed bank",
];
const OTA_HINTS = [
  "booking", "expedia", "agoda", "klook", "traveloka", "trip.com", "tripcom", "ctrip",
  "airbnb", "hotels.com", "tiket", "pegipegi", "makemy", "ostrovok", "despegar",
];
const DIRECT_HINTS = ["walk in", "walk-in", "individual reservation", "house use", "complimentary", "owner "];
const OVERSEAS_HINTS = ["overseas"];
const CORPORATE_HINTS = ["corporate", "company", "ministry", "embassy", "government", "gov ", "pt.", "cv."];

/** Map a free-form type/segment string (scraper or legacy enum) to a code, or null. */
export function normalizeSegmentCode(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (s === "exclude" || s === "remove" || s === "ignore") return EXCLUDE_SEGMENT;
  if (s === "ota") return "OTA";
  if (s === "ta" || s === "travel agent" || s === "travelagent") return "TRAVEL_AGENT";
  if (s === "overseas travel agent" || s === "overseas ta" || s === "overseas_travel_agent") return "OVERSEAS_TRAVEL_AGENT";
  if (s === "b2b" || s === "wholesaler" || s === "wholesale" || s === "bedbank" || s === "bed bank") return "B2B";
  if (s === "corporate" || s === "corp") return "CORPORATE";
  if (s === "direct" || s === "direct booking" || s === "direct_booking") return "DIRECT_BOOKING";
  // Already a known registry code?
  const upper = String(raw ?? "").trim().toUpperCase();
  if (SEGMENT_CODES.includes(upper)) return upper;
  return null;
}

/** Automatic classification by account name (last-resort fallback). */
export function classifySegment(name: string): string {
  const n = name.trim().toLowerCase();
  if (DIRECT_HINTS.some((h) => n.includes(h))) return "DIRECT_BOOKING";
  if (B2B_HINTS.some((h) => n.includes(h))) return "B2B";
  if (OVERSEAS_HINTS.some((h) => n.includes(h))) return "OVERSEAS_TRAVEL_AGENT";
  if (OTA_HINTS.some((h) => n.includes(h))) return "OTA";
  if (CORPORATE_HINTS.some((h) => n.includes(h))) return "CORPORATE";
  return DEFAULT_SEGMENT;
}

/**
 * Resolve an account's segment: a saved rule wins (including EXCLUDE), then a
 * type/segment the scraper sent, then automatic classification by name.
 */
export function resolveSegment(name: string, opts: { rule?: string | null; hint?: unknown } = {}): string {
  if (opts.rule && opts.rule.trim()) {
    return normalizeSegmentCode(opts.rule) ?? opts.rule.trim().toUpperCase();
  }
  return normalizeSegmentCode(opts.hint) ?? classifySegment(name);
}

export const isExcluded = (code: string): boolean => code === EXCLUDE_SEGMENT;
