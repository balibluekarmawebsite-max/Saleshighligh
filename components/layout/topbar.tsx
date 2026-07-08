import { Building2, CalendarDays, ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Placeholder topbar. The property and month selectors are static for now;
 * they become interactive filters in later phases.
 */
export function Topbar() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-foreground">Overview</h1>
      </div>

      <div className="flex items-center gap-2">
        {/* Property selector (placeholder) */}
        <span className="hidden items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground sm:inline-flex">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <span>All Properties</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>

        {/* Month selector (placeholder) */}
        <span className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-foreground">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span>Jul 2026</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </span>

        {/* Export (placeholder) */}
        <Button size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </div>
    </header>
  );
}
