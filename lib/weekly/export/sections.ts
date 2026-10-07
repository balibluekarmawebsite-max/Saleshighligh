/** Weekly report export section registry — client-safe (no server-only imports). */

export const WEEKLY_EXPORT_SECTIONS = [
  { id: "overview", label: "Sales & Marketing Overview" },
  { id: "monthly", label: "Monthly (Actual / Budget / LY)" },
  { id: "segments", label: "Market Segment" },
  { id: "ratecodes", label: "Rate Codes & Promotions" },
  { id: "channels", label: "Channel Room Nights" },
  { id: "social", label: "Social Media" },
  { id: "screenshots", label: "Screenshots & Summaries" },
  { id: "departments", label: "Department Activities & Training" },
  { id: "plans", label: "Action Plans" },
] as const;

export type WeeklyExportSectionId = (typeof WEEKLY_EXPORT_SECTIONS)[number]["id"];

export const WEEKLY_DEFAULT_SECTION_IDS: WeeklyExportSectionId[] =
  WEEKLY_EXPORT_SECTIONS.map((s) => s.id);
