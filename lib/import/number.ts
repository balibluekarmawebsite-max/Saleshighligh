/**
 * Locale-aware number parsing shared by the Excel import and the sales uploads.
 * Dependency-free (no xlsx) so it is safe to import from client components.
 *
 * Handles Indonesian ("137.350.206,00", dot thousands + comma decimal) and US
 * ("137,350,206.00") formats: when both separators appear the later one is the
 * decimal; a lone comma is a decimal; lone dots are thousands unless the group
 * is a single 1–2 digit decimal tail.
 */
export function normalizeNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  s = s.replace(/[^0-9.,-]/g, ""); // strip Rp, %, spaces
  if (s === "" || s === "-") return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  if (lastDot !== -1 && lastComma !== -1) {
    // Both separators: the later one is the decimal separator.
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(/,/g, "."); // Indonesian
    } else {
      s = s.replace(/,/g, ""); // US thousands
    }
  } else if (lastComma !== -1) {
    // Only commas → treat as decimal (Indonesian).
    s = s.replace(/,/g, ".");
  } else if (lastDot !== -1) {
    // Only dots: one dot with 1–2 trailing digits is a decimal; otherwise
    // dots are thousand separators (Indonesian).
    const parts = s.split(".");
    const tail = parts[parts.length - 1] ?? "";
    if (!(parts.length === 2 && tail.length > 0 && tail.length <= 2)) {
      s = s.replace(/\./g, "");
    }
  }

  const n = parseFloat(s);
  return Number.isNaN(n) ? null : n;
}
