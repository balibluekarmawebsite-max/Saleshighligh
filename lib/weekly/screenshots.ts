/** Screenshot categories for the weekly SM section — client-safe (no server imports). */

export const SCREENSHOT_CATEGORIES = [
  { id: "booking_com", label: "Booking.com" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "google_business", label: "Google Business Profile" },
  { id: "tripadvisor", label: "Tripadvisor" },
  { id: "other", label: "Other" },
] as const;

export type ScreenshotCategoryId = (typeof SCREENSHOT_CATEGORIES)[number]["id"];

/** Human label for a category id (falls back to the id itself). */
export function screenshotCategoryLabel(id: string): string {
  return SCREENSHOT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** Accepted image MIME types for upload. */
export const SCREENSHOT_MIME = ["image/png", "image/jpeg", "image/webp"];

/** Max upload size (bytes). Keeps one screenshot comfortably under the 10 MB body limit. */
export const SCREENSHOT_MAX_BYTES = 8 * 1024 * 1024;
