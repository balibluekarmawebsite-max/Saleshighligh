/** Shared display-label helpers for dashboard pages. */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-06" → "June 2026". */
export function periodLabel(period: string): string {
  const [year, month] = period.split("-");
  const idx = Number(month) - 1;
  return `${MONTHS[idx] ?? month} ${year}`;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "2026-07" → "Jul". */
export function periodMonthShort(period: string): string {
  const month = period.split("-")[1];
  return MONTHS_SHORT[Number(month) - 1] ?? (month ?? period);
}

/** Shorten long market-segment names for chart axis labels. */
export function shortSegment(name: string): string {
  const map: Record<string, string> = {
    "OTA (Online Travel Agent)": "OTA",
    "OTA (Wellness)": "OTA Well.",
    "Direct Booking": "Direct",
    "Group Wellness": "Grp Well.",
  };
  return map[name] ?? name;
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  OTA: "OTA",
  TA: "Travel Agent",
  CORPORATE: "Corporate",
  WHOLESALER: "Wholesaler",
};
