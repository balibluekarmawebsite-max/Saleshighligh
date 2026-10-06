import { Check, Circle } from "lucide-react";

import { type WeeklyProgressItem } from "@/lib/weekly/dashboard-data";
import { cn } from "@/lib/utils";

/** "Report progress" panel: which sections have data and overall completion. */
export function ReportProgress({ items }: { items: WeeklyProgressItem[] }) {
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {done} of {items.length} sections ready
        </p>
        <span className="text-sm font-semibold text-foreground">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-[hsl(var(--brand-gold))] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-1.5 pt-1">
        {items.map((it) => (
          <li key={it.key} className="flex items-center gap-2 text-sm">
            {it.done ? (
              <Check className="h-4 w-4 shrink-0 text-variance-positive" aria-hidden />
            ) : (
              <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" aria-hidden />
            )}
            <span className={cn(it.done ? "text-foreground" : "text-muted-foreground")}>
              <span className="font-medium">{it.key}.</span> {it.title}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
