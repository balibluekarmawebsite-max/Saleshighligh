"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileSpreadsheet, Upload } from "lucide-react";

import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();

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
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
              )}
            >
              <span
                className={cn(
                  "h-4 w-0.5 rounded-full",
                  active ? "bg-[hsl(var(--brand-gold))]" : "bg-transparent",
                )}
                aria-hidden
              />
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer — data admin */}
      <div className="space-y-1 border-t border-border px-3 py-4">
        <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Admin
        </p>
        {[
          { label: "Import Data", href: "/admin/import", icon: Upload },
          { label: "Get Template", href: "/admin/template", icon: FileSpreadsheet },
        ].map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground",
              )}
            >
              <span
                className={cn(
                  "h-4 w-0.5 rounded-full",
                  active ? "bg-[hsl(var(--brand-gold))]" : "bg-transparent",
                )}
                aria-hidden
              />
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
