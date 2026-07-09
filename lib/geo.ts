/** Geography helpers: flag emoji + ISO alpha-2 → numeric-3 (world-atlas ids). */

/** Regional-indicator flag emoji from an ISO alpha-2 code. */
export function flagEmoji(code: string | null | undefined): string {
  if (!code || code.length !== 2) return "🏳️";
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return "🏳️";
  return String.fromCodePoint(
    ...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** ISO 3166-1 alpha-2 → zero-padded numeric-3 (matches world-atlas geo.id). */
export const ALPHA2_TO_NUMERIC: Record<string, string> = {
  AU: "036", NZ: "554", GB: "826", IE: "372", FR: "250", DE: "276", NL: "528",
  BE: "056", ES: "724", IT: "380", PT: "620", CH: "756", AT: "040", SE: "752",
  NO: "578", DK: "208", FI: "246", PL: "616", RU: "643", RO: "642", TR: "792",
  GR: "300", CZ: "203", HU: "348", UA: "804", HR: "191", SK: "703", LU: "442",
  US: "840", CA: "124", MX: "484", BR: "076", AR: "032", CL: "152",
  CN: "156", JP: "392", KR: "410", HK: "344", TW: "158", SG: "702", MY: "458",
  TH: "764", ID: "360", PH: "608", VN: "704", IN: "356", PK: "586", BD: "050",
  AE: "784", SA: "682", QA: "634", KW: "414", IL: "376", LB: "422",
  ZA: "710", EG: "818", MA: "504", NG: "566", KE: "404",
};
