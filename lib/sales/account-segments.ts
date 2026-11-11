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
 *
 * The segment list mirrors the team's market-segment taxonomy (FIT / GIT groups).
 */

export interface SegmentDef {
  code: string;
  label: string;
  /** Market-segment group, for grouping the picker. */
  group?: "FIT" | "GIT";
}

/** The sentinel segment that drops a row from the report entirely. */
export const EXCLUDE_SEGMENT = "EXCLUDE";

/** Canonical segment list + display order. Extend by adding an entry. */
export const SEGMENTS: SegmentDef[] = [
  // FIT — Free Independent Traveller
  { code: "WALK_IN", label: "Walk In", group: "FIT" },
  { code: "DIRECT_BOOKING", label: "Direct Booking", group: "FIT" },
  { code: "WEBSITE", label: "Website", group: "FIT" },
  { code: "OTA", label: "OTA", group: "FIT" },
  { code: "CORPORATE", label: "Corporate", group: "FIT" },
  { code: "GOVERNMENT", label: "Government", group: "FIT" },
  { code: "LOCAL_TA", label: "Local TA", group: "FIT" },
  { code: "OVERSEAS_TA", label: "Overseas TA", group: "FIT" },
  { code: "LOCAL_WHOLESALE", label: "Local Wholesale", group: "FIT" },
  { code: "B2B", label: "B2B", group: "FIT" },
  { code: "OVERSEAS_WHOLESALE", label: "Overseas Wholesales", group: "FIT" },
  { code: "COMPLIMENTARY", label: "Complimentary", group: "FIT" },
  { code: "OTHERS", label: "Others", group: "FIT" },
  // GIT — Group Inclusive Tour
  { code: "GROUP_MICE", label: "Group MICE", group: "GIT" },
  { code: "GROUP_LEISURE", label: "Group Leisure", group: "GIT" },
  { code: "GOVERNMENT_GROUP", label: "Government Group", group: "GIT" },
  { code: "LOCAL_TA_GROUP", label: "Local TA Group", group: "GIT" },
  { code: "INTERNATIONAL_TA_GROUP", label: "International TA Group", group: "GIT" },
  { code: "INTERNATIONAL_SERIES", label: "International Series", group: "GIT" },
  { code: "GROUP_WELLNESS", label: "Group Wellness", group: "GIT" },
];

export const SEGMENT_CODES: string[] = SEGMENTS.map((s) => s.code);
export const SEGMENT_LABEL: Record<string, string> = Object.fromEntries(SEGMENTS.map((s) => [s.code, s.label]));
const SEGMENT_INDEX: Record<string, number> = Object.fromEntries(SEGMENTS.map((s, i) => [s.code, i]));

/** Default segment for a booker we can't place — the explicit catch-all, which
 * flags it for review so a human assigns it. */
export const DEFAULT_SEGMENT = "OTHERS";

/** The options offered in the admin segment picker: the registry + Exclude. */
export const SEGMENT_OPTIONS: SegmentDef[] = [
  ...SEGMENTS,
  { code: EXCLUDE_SEGMENT, label: "Exclude (hide from report)" },
];

/** Picker options grouped (FIT / GIT / Other) for an <optgroup> select. */
export const SEGMENT_OPTION_GROUPS: { group: string; options: SegmentDef[] }[] = [
  { group: "FIT", options: SEGMENTS.filter((s) => s.group === "FIT") },
  { group: "GIT", options: SEGMENTS.filter((s) => s.group === "GIT") },
  { group: "Other", options: [{ code: EXCLUDE_SEGMENT, label: "Exclude (hide from report)" }] },
];

/** The normalised key a rule is stored/looked-up under (stable across casing/spacing). */
export function accountKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Human label for a segment code (falls back to the raw code). */
export function segmentLabel(code: string): string {
  if (code === EXCLUDE_SEGMENT) return "Excluded";
  return SEGMENT_LABEL[code] ?? code;
}

/** Order a set of present segment codes by the registry order (unknowns last). */
export function orderSegments(codes: Iterable<string>): string[] {
  return [...new Set(codes)].sort((a, b) => (SEGMENT_INDEX[a] ?? 999) - (SEGMENT_INDEX[b] ?? 999) || a.localeCompare(b));
}

// Name hints for the automatic classifier (fallback when no rule + no type sent).
// Wholesalers are checked before OTAs (some bed-banks read like OTAs).
const WHOLESALE_HINTS = [
  "hotelbeds", "webbeds", "gta", "miki", "tourico", "jtb", "dida", "hotelspro", "w2m",
  "juniper", "roomsxml", "stuba", "bonotel", "darina", "wholesale", "bedbank", "bed bank",
];
const OTA_HINTS = [
  "booking", "expedia", "agoda", "klook", "traveloka", "trip.com", "tripcom", "ctrip",
  "airbnb", "hotels.com", "tiket", "pegipegi", "makemy", "ostrovok", "despegar",
];
const WALK_IN_HINTS = ["walk in", "walk-in", "walkin"];
const DIRECT_HINTS = ["individual reservation", "direct booking", "owner "];
const WEBSITE_HINTS = ["website", "web booking"];
const COMPLIMENTARY_HINTS = ["complimentary", "house use", "comp "];
const GOVERNMENT_HINTS = ["government", "ministry", "embassy", "gov "];
const CORPORATE_HINTS = ["corporate", "company"];
const OVERSEAS_HINTS = ["overseas"];

/** Map a free-form type/segment string (scraper, legacy enum, or label) to a code, or null. */
export function normalizeSegmentCode(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  const MAP: Record<string, string> = {
    exclude: EXCLUDE_SEGMENT, remove: EXCLUDE_SEGMENT, ignore: EXCLUDE_SEGMENT,
    "walk in": "WALK_IN", "walk-in": "WALK_IN", walkin: "WALK_IN",
    "direct booking": "DIRECT_BOOKING", direct: "DIRECT_BOOKING",
    website: "WEBSITE", web: "WEBSITE",
    ota: "OTA", "ota (online travel agent)": "OTA", "online travel agent": "OTA",
    corporate: "CORPORATE", corp: "CORPORATE",
    government: "GOVERNMENT", gov: "GOVERNMENT",
    "local ta": "LOCAL_TA", ta: "LOCAL_TA", "travel agent": "LOCAL_TA", // legacy TRAVEL_AGENT → Local TA
    "overseas ta": "OVERSEAS_TA", "overseas travel agent": "OVERSEAS_TA",
    "local wholesale": "LOCAL_WHOLESALE", "local wholesaler": "LOCAL_WHOLESALE",
    b2b: "B2B", wholesaler: "B2B", wholesale: "B2B", // legacy Wholesaler → B2B
    "overseas wholesale": "OVERSEAS_WHOLESALE", "overseas wholesales": "OVERSEAS_WHOLESALE",
    complimentary: "COMPLIMENTARY", comp: "COMPLIMENTARY", "house use": "COMPLIMENTARY",
    others: "OTHERS", other: "OTHERS",
    "group mice": "GROUP_MICE", mice: "GROUP_MICE",
    "group leisure": "GROUP_LEISURE",
    "government group": "GOVERNMENT_GROUP",
    "local ta group": "LOCAL_TA_GROUP",
    "international ta group": "INTERNATIONAL_TA_GROUP", "intl ta group": "INTERNATIONAL_TA_GROUP",
    "international series": "INTERNATIONAL_SERIES",
    "group wellness": "GROUP_WELLNESS",
  };
  if (MAP[s]) return MAP[s];
  // Already a known registry code (e.g. "OVERSEAS_TA") or a legacy code.
  const upper = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (SEGMENT_CODES.includes(upper)) return upper;
  if (upper === "TRAVEL_AGENT") return "LOCAL_TA";
  if (upper === "OVERSEAS_TRAVEL_AGENT") return "OVERSEAS_TA";
  return null;
}

/** Automatic classification by account name (last-resort fallback → Others). */
export function classifySegment(name: string): string {
  const n = name.trim().toLowerCase();
  const any = (hints: string[]) => hints.some((h) => n.includes(h));
  if (any(WALK_IN_HINTS)) return "WALK_IN";
  if (any(WEBSITE_HINTS)) return "WEBSITE";
  if (any(DIRECT_HINTS)) return "DIRECT_BOOKING";
  if (any(COMPLIMENTARY_HINTS)) return "COMPLIMENTARY";
  if (any(WHOLESALE_HINTS)) return "B2B";
  if (any(OTA_HINTS)) return "OTA";
  if (any(GOVERNMENT_HINTS)) return "GOVERNMENT";
  if (any(OVERSEAS_HINTS)) return "OVERSEAS_TA";
  if (any(CORPORATE_HINTS)) return "CORPORATE";
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
