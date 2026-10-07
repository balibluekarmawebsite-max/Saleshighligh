/** Digital Ads / ROAS platform registry — client-safe (no server imports). */

export const AD_PLATFORMS = [
  { id: "blended", label: "Blended (booked)" },
  { id: "google", label: "Google Ads" },
  { id: "meta", label: "Meta (Facebook / Instagram)" },
] as const;

export type AdPlatformId = (typeof AD_PLATFORMS)[number]["id"];

/** Platforms the sync pulls from the API's `platforms[]` split (not the blended total). */
export const AD_SPLIT_PLATFORMS = ["google", "meta"] as const;

export function adPlatformLabel(id: string): string {
  return AD_PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

/**
 * Which stored field holds the revenue used for a platform's ROAS:
 * the blended row uses booked `revenue`; the per-platform rows use attributed
 * `conversionValue`. Keeps the manual form to a single "Revenue" column while
 * mapping each row to the correct column.
 */
export function adsRevenueField(platform: string): "revenue" | "conversionValue" {
  return platform === "blended" ? "revenue" : "conversionValue";
}
