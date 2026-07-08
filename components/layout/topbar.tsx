"use client";

import { usePathname } from "next/navigation";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { activeNavItem } from "@/lib/nav";

const SECTION_TITLES: Record<string, string> = {
  "/": "Executive Summary",
};

export function Topbar() {
  const pathname = usePathname();
  const item = activeNavItem(pathname);
  const title = SECTION_TITLES[pathname] ?? item?.label ?? "Dashboard";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-6">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-foreground">{title}</h1>
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
