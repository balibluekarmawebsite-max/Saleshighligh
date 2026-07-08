import Link from "next/link";

import type { PropertyOption } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

/** Segmented control that switches the active property via a query param. */
export function PropertySwitcher({
  properties,
  activeCode,
}: {
  properties: PropertyOption[];
  activeCode: string;
}) {
  return (
    <div className="inline-flex rounded-md border border-border bg-card p-1">
      {properties.map((p) => (
        <Link
          key={p.code}
          href={`/?property=${p.code}`}
          aria-current={p.code === activeCode ? "page" : undefined}
          title={p.name}
          className={cn(
            "rounded px-3 py-1.5 text-sm font-medium transition-colors",
            p.code === activeCode
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {p.code}
        </Link>
      ))}
    </div>
  );
}
