"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export interface AccordionItem {
  title: string;
  content: React.ReactNode;
}

/** Collapsible, optionally numbered accordion. */
export function Accordion({
  items,
  numbered = false,
  defaultOpen = [0],
}: {
  items: AccordionItem[];
  numbered?: boolean;
  defaultOpen?: number[];
}) {
  const [open, setOpen] = useState<Set<number>>(new Set(defaultOpen));

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="divide-y divide-border rounded-md border border-border">
      {items.map((item, i) => {
        const isOpen = open.has(i);
        return (
          <div key={item.title}>
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-accent/40"
            >
              {numbered && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs text-secondary-foreground">
                  {i + 1}
                </span>
              )}
              <span className="flex-1">{item.title}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pl-12 text-sm text-muted-foreground">
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
