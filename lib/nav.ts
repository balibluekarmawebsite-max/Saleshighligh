import {
  BedDouble,
  CalendarRange,
  Flower2,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Megaphone,
  Share2,
  Star,
  Tag,
  UtensilsCrossed,
} from "lucide-react";

/** Shared navigation model used by the sidebar and topbar. */
export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** True once the target section has a real page (vs a "coming soon" stub). */
  ready: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", icon: LayoutDashboard, ready: true },
  { label: "Rooms", href: "/rooms", icon: BedDouble, ready: true },
  { label: "Digital Ads & ROAS", href: "/digital-ads", icon: Megaphone, ready: false },
  { label: "Online Reputation", href: "/reputation", icon: Star, ready: false },
  { label: "Restaurant", href: "/restaurant", icon: UtensilsCrossed, ready: false },
  { label: "Spa", href: "/spa", icon: Flower2, ready: false },
  { label: "Market Intelligence", href: "/market-intelligence", icon: LineChart, ready: false },
  { label: "Forecast", href: "/forecast", icon: CalendarRange, ready: false },
  { label: "Social Media", href: "/social", icon: Share2, ready: false },
  { label: "Action Plans", href: "/action-plans", icon: ListChecks, ready: false },
  { label: "Promotions", href: "/promotions", icon: Tag, ready: false },
];

/** Resolve the nav item for a pathname (longest matching href wins). */
export function activeNavItem(pathname: string): NavItem | undefined {
  if (pathname === "/") return NAV_ITEMS[0];
  return NAV_ITEMS.filter((i) => i.href !== "/").find((i) =>
    pathname.startsWith(i.href),
  );
}
