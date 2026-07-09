import { MoMBadge } from "@/components/dashboard/mom-badge";
import { Sparkline } from "@/components/dashboard/sparkline";
import { Card, CardContent } from "@/components/ui/card";
import { varianceColorClass, formatVariancePercent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface KpiCardProps {
  label: string;
  /** Preformatted headline value (IDR or %). */
  value: string;
  /** Signed delta vs budget (drives the arrow chip). */
  deltaPct: number | null;
  /** Unit for the vs-budget delta: "%" (default) or "pts" (percentage points). */
  deltaUnit?: "%" | "pts";
  /** Preformatted budget value, e.g. "Rp 1.089.643.475" or "90.19%". */
  budgetValue?: string;
  /** Optional signed variance % vs last year. */
  lastYearDeltaPct?: number | null;
  /** Optional trend series for a small sparkline. */
  spark?: number[];
}

export function KpiCard({
  label,
  value,
  deltaPct,
  deltaUnit = "%",
  budgetValue,
  lastYearDeltaPct,
  spark,
}: KpiCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          {spark && spark.length > 1 && <Sparkline data={spark} />}
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <MoMBadge value={deltaPct} unit={deltaUnit} />
          {budgetValue && (
            <span className="text-muted-foreground">vs budget {budgetValue}</span>
          )}
          {lastYearDeltaPct !== undefined && lastYearDeltaPct !== null && (
            <span
              className={cn(
                "border-l border-border pl-2",
                varianceColorClass(lastYearDeltaPct),
              )}
            >
              {formatVariancePercent(lastYearDeltaPct)} vs LY
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
