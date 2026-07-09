"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings } from "lucide-react";

import {
  ADMIN_NAV,
  DASHBOARD_NAV,
  dashHref,
} from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Path relative to /dashboard/[property]/[period] for the current URL, or null. */
function currentRel(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard" || parts.length < 3) return null;
  return parts.slice(3).join("/");
}

export function Sidebar({
  property,
  period,
}: {
  property: string;
  period: string;
}) {
  const pathname = usePathname();
  const rel = currentRel(pathname);

  return (
    <aside className="hidden h-screen w-64 shrink-0 flex-col border-r border-border bg-white lg:flex">
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {DASHBOARD_NAV.map((item) => {
          const Icon = item.icon;
          const active =
            rel !== null &&
            (item.href === ""
              ? rel === ""
              : rel === item.href || rel.startsWith(`${item.href}/`));
          return (
            <div key={item.href || "overview"}>
              <Link
                href={dashHref(property, period, item.href)}
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

              {item.children && active && (
                <div className="ml-9 mt-1 space-y-1 border-l border-border pl-3">
                  {item.children.map((child) => {
                    const childActive = rel === child.href;
                    return (
                      <Link
                        key={child.href}
                        href={dashHref(property, period, child.href)}
                        aria-current={childActive ? "page" : undefined}
                        className={cn(
                          "block rounded-md px-2 py-1.5 text-sm transition-colors",
                          childActive
                            ? "font-medium text-primary"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border px-3 py-4">
        <p className="flex items-center gap-2 px-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Settings className="h-3.5 w-3.5" /> Admin
        </p>
        {ADMIN_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.ready ? item.href : "#"}
              aria-disabled={!item.ready}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-accent text-accent-foreground"
                  : item.ready
                    ? "text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground"
                    : "cursor-not-allowed text-muted-foreground/50",
              )}
            >
              <span>{item.label}</span>
              {!item.ready && <span className="text-[10px]">soon</span>}
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
