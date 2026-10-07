"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, CalendarRange, ChevronDown } from "lucide-react";

import { WeeklyExportModal } from "@/components/weekly/weekly-export-modal";
import { type PropertyOption } from "@/lib/dashboard-data";
import { type WeeklyWeekOption } from "@/lib/weekly/dashboard-data";
import { weeklyHref, weeklySectionTitle } from "@/lib/nav";
import { weekLabel } from "@/lib/weekly/week";
import { cn } from "@/lib/utils";

function relFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.slice(3).join("/");
}

/** Weekly Reports top bar: section title, property switcher, and a week picker. */
export function WeeklyContextBar({
  properties,
  weeks,
  property,
  week,
}: {
  properties: PropertyOption[];
  weeks: WeeklyWeekOption[];
  property: string;
  week: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const rel = relFromPath(pathname);

  // Ensure the current week is always selectable, even if it has no data yet.
  const inList = weeks.some((w) => w.week === week);
  const options = inList
    ? weeks
    : [{ week, label: weekLabel(week), status: "" }, ...weeks];
  const currentStatus = weeks.find((w) => w.week === week)?.status;

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

        {/* Week picker */}
        <div className="relative inline-flex items-center">
          <CalendarRange
            className="pointer-events-none absolute left-2 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
          <select
            value={week}
            onChange={(e) => router.push(weeklyHref(property, e.target.value, rel))}
            className="h-9 appearance-none rounded-md border border-border bg-card pl-8 pr-8 text-sm text-foreground"
            aria-label="Report week"
          >
            {options.map((w) => (
              <option key={w.week} value={w.week}>
                {w.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground"
            aria-hidden
          />
        </div>

        {currentStatus && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium capitalize text-secondary-foreground">
            {currentStatus.replace(/_/g, " ").toLowerCase()}
          </span>
        )}

        <WeeklyExportModal property={property} week={week} />
      </div>
    </header>
  );
}
