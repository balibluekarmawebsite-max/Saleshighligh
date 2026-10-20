"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Building2, CalendarClock, ChevronDown } from "lucide-react";

import { type DailyMonthOption } from "@/lib/daily/pickup-report-data";
import { type PropertyOption } from "@/lib/dashboard-data";
import { dailyHref, dailySectionTitle } from "@/lib/nav";
import { cn } from "@/lib/utils";

function relFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.slice(3).join("/");
}

/** "October 2026" fallback label for a `yyyy-mm` month with no option row. */
function monthLabel(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  if (!y || !m) return month;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Daily Report top bar: section title, property switcher, and a month picker. */
export function DailyContextBar({
  properties,
  months,
  property,
  month,
}: {
  properties: PropertyOption[];
  months: DailyMonthOption[];
  property: string;
  month: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const rel = relFromPath(pathname);

  // Always keep the current month selectable, even with no snapshots yet.
  const inList = months.some((m) => m.month === month);
  const options = inList
    ? months
    : [{ month, label: monthLabel(month), snapshots: 0 }, ...months];

  return (
    <header className="flex min-h-16 flex-col gap-3 border-b border-border bg-white px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold text-foreground">{dailySectionTitle(rel)}</h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Property switcher */}
        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1">
          <Building2 className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden />
          {properties.map((p) => (
            <Link
              key={p.code}
              href={dailyHref(p.code, month, rel)}
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

        {/* Month picker */}
        <div className="relative inline-flex items-center">
          <CalendarClock className="pointer-events-none absolute left-2 h-4 w-4 text-muted-foreground" aria-hidden />
          <select
            value={month}
            onChange={(e) => router.push(dailyHref(property, e.target.value, rel))}
            className="h-9 appearance-none rounded-md border border-border bg-card pl-8 pr-8 text-sm text-foreground"
            aria-label="Snapshot month"
          >
            {options.map((m) => (
              <option key={m.month} value={m.month}>
                {m.label}
                {m.snapshots > 0 ? ` · ${m.snapshots}d` : ""}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground" aria-hidden />
        </div>
      </div>
    </header>
  );
}
