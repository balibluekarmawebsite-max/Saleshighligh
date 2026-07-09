"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { DASHBOARD_NAV, dashHref } from "@/lib/nav";
import { cn } from "@/lib/utils";

function currentRel(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "dashboard" || parts.length < 3) return null;
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
  const rel = currentRel(pathname);

  return (
    <nav className="flex gap-2 overflow-x-auto border-b border-border bg-white px-4 py-2 lg:hidden">
      {DASHBOARD_NAV.map((item) => {
        const active =
          rel !== null &&
          (item.href === "" ? rel === "" : rel === item.href || rel.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href || "overview"}
            href={dashHref(property, period, item.href)}
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
