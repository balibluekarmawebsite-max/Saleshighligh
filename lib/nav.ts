import {
  BedDouble,
  Flower2,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Megaphone,
  Share2,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

/** A section link, relative to /dashboard/[property]/[period]/. */
export interface DashNavItem {
  label: string;
  /** Path relative to the period root ("" = Executive Summary). */
  href: string;
  icon: LucideIcon;
  children?: { label: string; href: string }[];
}

export const DASHBOARD_NAV: DashNavItem[] = [
  { label: "Executive Summary", href: "summary", icon: LayoutDashboard },
  {
    label: "Rooms Analytics",
    href: "rooms",
    icon: BedDouble,
    children: [
      { label: "Market & Accounts", href: "rooms/segments" },
      { label: "Room Types", href: "rooms/room-types" },
      { label: "Guests & Geography", href: "rooms/guests" },
    ],
  },
  { label: "Digital Ads & Reputation", href: "marketing", icon: Megaphone },
  { label: "Restaurant", href: "restaurant", icon: UtensilsCrossed },
  { label: "Spa & Wellness", href: "spa", icon: Flower2 },
  { label: "Market & Forecast", href: "market", icon: LineChart },
  { label: "Social Media & PR", href: "social", icon: Share2 },
  { label: "Action Plans & Promotions", href: "plans", icon: ListChecks },
];

export interface AdminNavItem {
  label: string;
  href: string;
  ready: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  { label: "Import", href: "/admin/import", ready: true },
  { label: "Templates", href: "/admin/template", ready: true },
  { label: "Activity", href: "/admin/activity", ready: true },
  { label: "Users", href: "/admin/users", ready: true },
  { label: "Manual Entry", href: "/admin/data", ready: false },
];

/** Build an absolute dashboard href from a property, period and relative path. */
export function dashHref(property: string, period: string, rel: string): string {
  const base = `/dashboard/${property}/${period}`;
  return rel ? `${base}/${rel}` : base;
}

/** Human title for a section, given the path relative to the period root. */
export function sectionTitle(rel: string): string {
  if (rel === "") return "Executive Summary";
  for (const item of DASHBOARD_NAV) {
    if (item.href === rel) return item.label;
    const child = item.children?.find((c) => c.href === rel);
    if (child) return `${item.label} — ${child.label}`;
  }
  return "Dashboard";
}
