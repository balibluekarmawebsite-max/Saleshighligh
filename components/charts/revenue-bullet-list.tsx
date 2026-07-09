import { variancePct } from "@/lib/calculations";
import { formatIDRCompact, formatVariancePercent, varianceColorClass } from "@/lib/format";

export interface BulletItem {
  label: string;
  actual: number;
  budget: number;
}

/**
 * Bullet-style bars: each room type's revenue (filled bar) against its budget
 * target (marker). Pure markup — no chart library. Bars share one scale.
 */
export function RevenueBulletList({ items }: { items: BulletItem[] }) {
  const max = Math.max(1, ...items.map((i) => Math.max(i.actual, i.budget)));

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const actualPct = (item.actual / max) * 100;
        const budgetPct = (item.budget / max) * 100;
        const v = variancePct(item.actual, item.budget);
        const met = item.actual >= item.budget;
        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground">{item.label}</span>
              <span className="flex items-center gap-2 text-xs">
                <span className="tabular-nums text-foreground">{formatIDRCompact(item.actual)}</span>
                <span className={varianceColorClass(v)}>{formatVariancePercent(v)}</span>
              </span>
            </div>
            <div className="relative h-4 rounded bg-muted">
              <div
                className={met ? "h-4 rounded bg-brand-teal" : "h-4 rounded bg-brand-teal/70"}
                style={{ width: `${actualPct}%` }}
              />
              {/* Budget target marker */}
              <div
                className="absolute top-[-2px] h-6 w-0.5 bg-brand-gold"
                style={{ left: `${budgetPct}%` }}
                title={`Budget ${formatIDRCompact(item.budget)}`}
                aria-hidden
              />
            </div>
          </div>
        );
      })}
      <div className="flex items-center gap-4 pt-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm bg-brand-teal" /> Actual
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-brand-gold" /> Budget target
        </span>
      </div>
    </div>
  );
}
