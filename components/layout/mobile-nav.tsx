"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DASHBOARD_NAV,
  WEEKLY_NAV,
  dashHref,
  projectForPath,
  weeklyHref,
  type DashNavItem,
} from "@/lib/nav";
import { cn } from "@/lib/utils";

function currentRel(pathname: string, base: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== base || parts.length < 3) return null;
  return parts.slice(3).join("/");
}

/** Horizontally scrollable section pills for small screens (phones/tablets). */
export function MobileNav({
  property,
  period,
}: {
  property: string;
  period: string;
}) {
  const pathname = usePathname();
  const project = projectForPath(pathname);
  const base = project === "weekly" ? "weekly" : "dashboard";
  const rel = currentRel(pathname, base);
  const navItems: DashNavItem[] = project === "weekly" ? WEEKLY_NAV : DASHBOARD_NAV;
  const hrefFor = (relPath: string) =>
    project === "weekly"
      ? weeklyHref(property, period, relPath)
      : dashHref(property, period, relPath);

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-border bg-white px-4 py-2 lg:hidden">
      {navItems.map((item) => {
        const active =
          rel !== null &&
          (item.href === ""
            ? rel === ""
            : rel === item.href ||
              rel.startsWith(`${item.href}/`) ||
              (item.aliases?.some((a) => rel === a || rel.startsWith(`${a}/`)) ?? false));
        return (
          <Link
            key={item.href || "overview"}
            href={hrefFor(item.href)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
