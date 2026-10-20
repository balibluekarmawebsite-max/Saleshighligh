/**
 * Canonical names for the VHP scraped-data feeds.
 *
 * One source of truth, shared by the Request Scrape UI, the job list, and the
 * scraper integration (docs/VHP_INTEGRATION.md). `code` is the value the scraper
 * sends as the job's `section`.
 *
 *   B      → Yearly Occupancy Report   (weekly Section B source)
 *   C      → Reservation Report        (weekly Section C source)
 *   CANCEL → Cancellation Report        (daily report; same-day book-and-cancel excluded)
 *   PICKUP → Occupancy Pickup Report    (daily report; daily snapshot of the
 *                                        Yearly Occupancy forecast = occ-on-hand)
 */

export type ScrapeReport = "weekly" | "daily";

export interface ScrapeSectionDef {
  /** The scrape-job `section` value the scraper POSTs. */
  code: string;
  /** Human name shown across the app. */
  name: string;
  /** The VHP report/export the scraper runs for this feed. */
  vhpSource: string;
  /** Which report module this feed belongs to. */
  report: ScrapeReport;
  /** "live" = ingestion is built; "planned" = name reserved, ingestion upcoming. */
  status: "live" | "planned";
}

export const SCRAPE_SECTIONS: ScrapeSectionDef[] = [
  {
    code: "B",
    name: "Yearly Occupancy Report",
    vhpSource: "Yearly Forecast Of Room Occupancy (Show Revenue on)",
    report: "weekly",
    status: "live",
  },
  {
    code: "C",
    name: "Reservation Report",
    vhpSource: "Reservation By Creation Date (grouped by booking agent)",
    report: "weekly",
    status: "live",
  },
  {
    code: "CANCEL",
    name: "Cancellation Report",
    vhpSource: "Cancelled reservations (per-line; Cancel Date + Created Date)",
    report: "daily",
    status: "live",
  },
  {
    code: "PICKUP",
    name: "Occupancy Pickup Report",
    vhpSource: "Yearly Forecast Of Room Occupancy (daily snapshot = occ-on-hand)",
    report: "daily",
    status: "live",
  },
];

const BY_CODE = new Map(SCRAPE_SECTIONS.map((s) => [s.code, s]));

/** Friendly name for a scrape-section code (falls back to the raw code). */
export function scrapeSectionName(code: string): string {
  return BY_CODE.get(code.toUpperCase())?.name ?? code;
}

/** Look up a feed by its code. */
export function getScrapeSection(code: string): ScrapeSectionDef | undefined {
  return BY_CODE.get(code.toUpperCase());
}

/** Feeds a user can request from the weekly Request Scrape UI (live + weekly). */
export const WEEKLY_SCRAPE_SECTIONS = SCRAPE_SECTIONS.filter(
  (s) => s.report === "weekly" && s.status === "live",
);
