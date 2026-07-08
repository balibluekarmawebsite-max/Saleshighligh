/**
 * Static reference data for Blue Karma Group.
 *
 * These are the three properties and their outlets. Kept as typed constants so
 * UI, parsers, and calculations share one source of truth until the values are
 * moved into the database (see the Property/Outlet models in prisma/schema.prisma).
 */

export type PropertyCode = "BKDS" | "BKDU" | "BKV";

export interface PropertyInfo {
  code: PropertyCode;
  name: string;
  area: string;
  restaurant: string;
  spa: string;
  roomCount: number;
}

export const PROPERTIES: readonly PropertyInfo[] = [
  {
    code: "BKDS",
    name: "Blue Karma Dijiwa Seminyak",
    area: "Seminyak",
    restaurant: "BKeto",
    spa: "Mudara",
    roomCount: 18,
  },
  {
    code: "BKDU",
    name: "Blue Karma Dijiwa Ubud",
    area: "Ubud",
    restaurant: "Botanist",
    spa: "Flying Bamboo",
    roomCount: 20,
  },
  {
    code: "BKV",
    name: "Blue Karma Village",
    area: "Umalas",
    restaurant: "Hiiragi",
    spa: "Heiwa",
    roomCount: 15,
  },
] as const;

export const PROPERTY_BY_CODE: Record<PropertyCode, PropertyInfo> =
  Object.fromEntries(PROPERTIES.map((p) => [p.code, p])) as Record<
    PropertyCode,
    PropertyInfo
  >;

/** Report sections that make up a monthly Sales Highlight (in slide order). */
export const REPORT_SECTIONS = [
  "Executive Summary vs Budget",
  "Rooms Analytics",
  "Digital Ads & ROAS",
  "Online Reputation",
  "Restaurant Performance",
  "Spa Performance",
  "Market Intelligence & Booking Pace",
  "6-Month Forecast",
  "Social Media",
  "Action Plans",
  "Promotions",
] as const;

export type ReportSection = (typeof REPORT_SECTIONS)[number];
