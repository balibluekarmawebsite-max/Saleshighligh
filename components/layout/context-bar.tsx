"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Building2, ChevronDown } from "lucide-react";

import { ExportModal } from "@/components/dashboard/export-modal";
import { GROUP_CODE, type PeriodOption, type PropertyOption } from "@/lib/dashboard-data";
import { sectionTitle } from "@/lib/nav";
import { cn } from "@/lib/utils";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(period: string): string {
  const [y, m] = period.split("-");
  const idx = Number(m) - 1;
  return `${MONTHS[idx] ?? m} ${y}`;
}

function relFromPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  return parts.slice(3).join("/");
}

export function ContextBar({
  properties,
  periodsByProperty,
  property,
  period,
}: {
  properties: PropertyOption[];
  periodsByProperty: Record<string, PeriodOption[]>;
  property: string;
  period: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rel = relFromPath(pathname);
  const scope = searchParams.get("scope") === "ytd" ? "YTD" : "MTD";

  const periods = periodsByProperty[property] ?? [];
  const currentStatus = periods.find((p) => p.period === period)?.status;

  function build(prop: string, per: string, s: "MTD" | "YTD" = scope): string {
    const base = rel ? `/dashboard/${prop}/${per}/${rel}` : `/dashboard/${prop}/${per}`;
    return s === "YTD" ? `${base}?scope=ytd` : base;
  }

  const switcher: { code: string; label: string }[] = [
    ...properties.map((p) => ({ code: p.code, label: p.code })),
    { code: GROUP_CODE, label: "Group" },
  ];

  return (
    <header className="flex min-h-16 flex-col gap-3 border-b border-border bg-white px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-2">
        <h1 className="text-base font-semibold text-foreground">
          {sectionTitle(rel)}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Property switcher */}
        <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-1">
          <Building2 className="mx-1 h-4 w-4 text-muted-foreground" aria-hidden />
          {switcher.map((p) => {
            const targetPeriod =
              p.code === property
                ? period
                : (periodsByProperty[p.code]?.[0]?.period ?? period);
            return (
              <Link
                key={p.code}
                href={build(p.code, targetPeriod)}
                aria-current={p.code === property ? "page" : undefined}
                className={cn(
                  "rounded px-2.5 py-1 text-sm font-medium transition-colors",
                  p.code === property
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </Link>
            );
          })}
        </div>

        {/* Month-Year picker */}
        <div className="relative inline-flex items-center">
          <select
            value={period}
            onChange={(e) => router.push(build(property, e.target.value))}
            className="h-9 appearance-none rounded-md border border-border bg-card pl-3 pr-8 text-sm text-foreground"
            aria-label="Report month"
          >
            {periods.length === 0 && <option value={period}>{monthLabel(period)}</option>}
            {periods.map((p) => (
              <option key={p.period} value={p.period}>
                {monthLabel(p.period)}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground" />
        </div>
        {currentStatus && (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
            {currentStatus === "FINAL" ? "Final" : "Draft"}
          </span>
        )}

        {/* MTD / YTD toggle */}
        <div className="inline-flex rounded-md border border-border bg-card p-1">
          {(["MTD", "YTD"] as const).map((s) => (
            <Link
              key={s}
              href={build(property, period, s)}
              aria-current={scope === s ? "page" : undefined}
              className={cn(
                "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                scope === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s}
            </Link>
          ))}
        </div>

        <ExportModal property={property} period={period} />
      </div>
    </header>
  );
}
