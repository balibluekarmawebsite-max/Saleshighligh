/**
 * The data feeds the Scraper Health monitor watches.
 *
 * DAILY feeds are pushed each morning by the always-on office-PC VHP scraper
 * (one push per property per feed → one `AuditLog` row with that `action` and the
 * property code as `entity`). The monitor's "did it arrive today?" signal is
 * exactly the presence of that audit row for the current WITA day.
 *
 * Keep the audit `action` strings in step with the import orchestrators
 * (lib/daily/import-*.ts) and the raw-data labels (lib/daily/raw-data.ts).
 */

export type DailyFeedKey = "occupancy" | "reservation" | "departure" | "cancellation";

export interface DailyFeedDef {
  key: DailyFeedKey;
  /** Human label (matches the Raw Data page). */
  label: string;
  /** Audit action logged on a successful push of this feed. */
  auditAction: string;
  /**
   * Critical feeds drive the alert + auto-recover (the daily report is wrong
   * without them). Secondary feeds are recorded + shown but, on their own, only
   * raise a soft warning.
   */
  critical: boolean;
  /** One-line description for the monitor. */
  note: string;
}

export const DAILY_FEEDS: DailyFeedDef[] = [
  {
    key: "occupancy",
    label: "Occupancy (Yearly Forecast)",
    auditAction: "daily_pickup_import",
    critical: true,
    note: "Rooms on the books per stay month — the core of the daily report.",
  },
  {
    key: "reservation",
    label: "Reservation (pickup + arrivals)",
    auditAction: "daily_reservation_import",
    critical: true,
    note: "Yesterday's pick-up by agent and arrival room counts.",
  },
  {
    key: "departure",
    label: "Room Departure",
    auditAction: "daily_departure_import",
    critical: false,
    note: "Departure room counts per stay date.",
  },
  {
    key: "cancellation",
    label: "Cancellations",
    auditAction: "daily_cancellation_import",
    critical: false,
    note: "Cancelled reservation lines (used to net off same-day cancels).",
  },
];

/** All daily audit actions, for a single `action in (...)` query. */
export const DAILY_FEED_ACTIONS: string[] = DAILY_FEEDS.map((f) => f.auditAction);

/** Look up a feed definition by audit action. */
export function feedByAction(action: string): DailyFeedDef | undefined {
  return DAILY_FEEDS.find((f) => f.auditAction === action);
}
