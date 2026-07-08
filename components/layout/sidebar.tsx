import {
  LayoutDashboard,
  BedDouble,
  Megaphone,
  Star,
  UtensilsCrossed,
  Flower2,
  LineChart,
  CalendarRange,
  Share2,
  ListChecks,
  Tag,
  Settings,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Placeholder left navigation. Routes are wired up in later phases; for now the
 * items are non-interactive and mirror the monthly Sales Highlight sections.
 */

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Rooms", icon: BedDouble },
  { label: "Digital Ads & ROAS", icon: Megaphone },
  { label: "Online Reputation", icon: Star },
  { label: "Restaurant", icon: UtensilsCrossed },
  { label: "Spa", icon: Flower2 },
  { label: "Market Intelligence", icon: LineChart },
  { label: "Forecast", icon: CalendarRange },
  { label: "Social Media", icon: Share2 },
  { label: "Action Plans", icon: ListChecks },
  { label: "Promotions", icon: Tag },
];

export function Sidebar() {
  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-white lg:flex">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-border px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary">
          <span className="text-sm font-bold tracking-tight text-primary-foreground">
            BK
          </span>
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-foreground">Blue Karma</p>
          <p className="text-xs text-muted-foreground">Sales Dashboard</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {PRIMARY_NAV.map((item) => {
          const Icon = item.icon;
          return (
            <span
              key={item.label}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                item.active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
              )}
            >
              {/* Gold active indicator */}
              <span
                className={cn(
                  "h-4 w-0.5 rounded-full",
                  item.active
                    ? "bg-[hsl(var(--brand-gold))]"
                    : "bg-transparent",
                )}
                aria-hidden
              />
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </span>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-3 py-4">
        <span className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground">
          <Settings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </span>
      </div>
    </aside>
  );
}
