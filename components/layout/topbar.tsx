import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * App topbar. The property switcher and period live in the page header; the
 * Export action (monthly Sales Highlight) is wired up in a later phase.
 */
export function Topbar() {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-foreground">
          Executive Summary
        </h1>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" className="gap-2">
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export</span>
        </Button>
      </div>
    </header>
  );
}
