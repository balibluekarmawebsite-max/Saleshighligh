import {
  BarChart3,
  BedDouble,
  CalendarRange,
  ClipboardList,
  Download,
  FileText,
  Flower2,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Megaphone,
  Settings,
  Share2,
  Upload,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";

/** The two top-level projects in the app. Each has its own section menu. */
export type ProjectKey = "sales" | "weekly";

export interface ProjectDef {
  key: ProjectKey;
  label: string;
  /** Base path whose index resolves the project's default landing. */
  href: string;
  icon: LucideIcon;
}

export const PROJECTS: ProjectDef[] = [
  { key: "sales", label: "Sales Highlight", href: "/dashboard", icon: BarChart3 },
  { key: "weekly", label: "Weekly Reports", href: "/weekly", icon: CalendarRange },
];

/** Which project a pathname belongs to (defaults to sales). */
export function projectForPath(pathname: string): ProjectKey {
  return pathname.startsWith("/weekly") ? "weekly" : "sales";
}

/** A section link, relative to a project's /[property]/[period] root. */
export interface DashNavItem {
  label: string;
  /** Path relative to the period root. */
  href: string;
  icon: LucideIcon;
  children?: { label: string; href: string }[];
  /** Extra relative paths that should also mark this item active (e.g. editor → Weekly Reports). */
  aliases?: string[];
}

// ─── Sales Highlight (monthly) ──────────────────────────────────────────────

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

// ─── Weekly Reports ─────────────────────────────────────────────────────────

export const WEEKLY_NAV: DashNavItem[] = [
  { label: "Dashboard", href: "dashboard", icon: LayoutDashboard },
  { label: "Trends", href: "trends", icon: LineChart },
  { label: "Weekly Reports", href: "reports", icon: FileText, aliases: ["editor"] },
  { label: "Data Import", href: "import", icon: Upload },
  { label: "Department Inputs", href: "departments", icon: ClipboardList },
  { label: "Export Center", href: "export", icon: Download },
  { label: "Settings", href: "settings", icon: Settings },
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

// ─── Sales Highlight hrefs + titles ─────────────────────────────────────────

/** Build an absolute Sales Highlight href from a property, period and relative path. */
export function dashHref(property: string, period: string, rel: string): string {
  const base = `/dashboard/${property}/${period}`;
  return rel ? `${base}/${rel}` : base;
}

/** Human title for a Sales Highlight section, given the path relative to the period root. */
export function sectionTitle(rel: string): string {
  if (rel === "") return "Executive Summary";
  for (const item of DASHBOARD_NAV) {
    if (item.href === rel) return item.label;
    const child = item.children?.find((c) => c.href === rel);
    if (child) return `${item.label} — ${child.label}`;
  }
  return "Dashboard";
}

// ─── Weekly Reports hrefs + titles ──────────────────────────────────────────

/** Build an absolute Weekly Reports href from a property, week id and relative path. */
export function weeklyHref(property: string, week: string, rel: string): string {
  const base = `/weekly/${property}/${week}`;
  return rel ? `${base}/${rel}` : base;
}

/** Human title for a Weekly Reports section, given the path relative to the week root. */
export function weeklySectionTitle(rel: string): string {
  if (rel === "") return "Dashboard";
  for (const item of WEEKLY_NAV) {
    if (item.href === rel) return item.label;
    const child = item.children?.find((c) => c.href === rel);
    if (child) return `${item.label} — ${child.label}`;
  }
  return "Weekly Reports";
}
