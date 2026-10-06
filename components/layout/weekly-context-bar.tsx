"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarRange } from "lucide-react";

import { type PropertyOption } from "@/lib/dashboard-data";
import { weeklyHref, weeklySectionTitle } from "@/lib/nav";
import { weekLabel } from "@/lib/weekly/week";
import { cn } from "@/lib/utils";

function relFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.slice(3).join("/");
}

/**
 * Weekly Reports top bar: section title, property switcher, and the active week.
 * A proper week picker lands with the weekly data model (so it can list the
 * weeks that actually exist); for now the current week is shown as a label.
 */
export function WeeklyContextBar({
  properties,
  property,
  week,
}: {
  properties: PropertyOption[];
  property: string;
  week: string;
}) {
  const pathname = usePathname();
  const rel = relFromPath(pathname);

  return (
    <header className="flex min-h-16 flex-col gap-3 border-b border-border bg-white px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold text-foreground">
          {weeklySectionTitle(rel)}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Property switcher */}
        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1">
          <Building2 className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden />
          {properties.map((p) => (
            <Link
              key={p.code}
              href={weeklyHref(p.code, week, rel)}
              aria-current={p.code === property ? "page" : undefined}
              className={cn(
                "rounded px-2.5 py-1 text-sm font-medium transition-colors",
                p.code === property
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p.code}
            </Link>
          ))}
        </div>

        {/* Active week */}
        <span className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm text-foreground">
          <CalendarRange className="h-4 w-4 text-muted-foreground" aria-hidden />
          {weekLabel(week)}
        </span>
      </div>
    </header>
  );
}
