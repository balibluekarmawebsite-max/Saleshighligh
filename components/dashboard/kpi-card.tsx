import { variancePct } from "@/lib/calculations";
import type { MetricAB } from "@/lib/dashboard-data";
import {
  formatIDR,
  formatPercent,
  formatVariancePercent,
  varianceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

interface KpiCardProps {
  label: string;
  metric: MetricAB | null;
  /** "currency" → IDR; "percent" → ratio stored 0–1, shown as %. */
  kind: "currency" | "percent";
}

function display(value: number, kind: KpiCardProps["kind"]): string {
  return kind === "currency" ? formatIDR(value) : formatPercent(value * 100);
}

export function KpiCard({ label, metric, kind }: KpiCardProps) {
  const variance = metric ? variancePct(metric.actual, metric.budget) : null;

  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          {metric ? display(metric.actual, kind) : "—"}
        </p>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span className={cn("font-medium", varianceColorClass(variance))}>
            {formatVariancePercent(variance)}
          </span>
          <span className="text-muted-foreground">
            vs budget {metric ? display(metric.budget, kind) : "—"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
