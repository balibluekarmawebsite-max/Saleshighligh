import type { MealRow } from "@/lib/dashboard-data";
import { formatIDR, formatNumber, formatPercent, formatVariancePercent, varianceColorClass } from "@/lib/format";
import { buildSalesTable, type SalesCell, type SalesMealBlock } from "@/lib/sales/restaurant-sales-table";
import { cn } from "@/lib/utils";

const MEAL_LABEL: Record<string, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner", TOTAL: "TOTAL" };

type RowKind = "cover" | "money";

/** One data row (Cover / Average Check / Revenue) across the six columns. */
function Row({
  label,
  c,
  kind,
  sharePctSigned,
  isTotal,
}: {
  label: string;
  c: SalesCell;
  kind: RowKind;
  /** true → %A/%B are a signed deviation (average check); false → mix share. */
  sharePctSigned: boolean;
  isTotal: boolean;
}) {
  const fmt = (v: number) => (kind === "cover" ? formatNumber(v) : formatIDR(v));
  const sharePct = (v: number) => (sharePctSigned ? formatVariancePercent(v) : formatPercent(v));
  return (
    <tr className={cn("border-b border-border/60", isTotal && "font-semibold")}>
      <td className="whitespace-nowrap px-3 py-1.5 text-foreground">{label}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{fmt(c.actual)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{sharePct(c.actualPct)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{fmt(c.budget)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{sharePct(c.budgetPct)}</td>
      <td className={cn("px-3 py-1.5 text-right tabular-nums", varianceColorClass(c.diff))}>
        {c.diff < 0 ? `(${fmt(Math.abs(c.diff))})` : fmt(c.diff)}
      </td>
      <td className={cn("px-3 py-1.5 text-right tabular-nums", varianceColorClass(c.diffPct ?? 0))}>
        {c.diffPct != null ? formatVariancePercent(c.diffPct) : "—"}
      </td>
    </tr>
  );
}

function Block({ block }: { block: SalesMealBlock }) {
  const isTotal = block.meal === "TOTAL";
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-border bg-secondary/50 text-xs font-semibold text-foreground">
            <th className="px-3 py-2 text-left">{MEAL_LABEL[block.meal] ?? block.meal}</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Actual</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">%</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Budget</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">%</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">Different</th>
            <th className="px-3 py-2 text-right font-medium text-muted-foreground">%</th>
          </tr>
        </thead>
        <tbody>
          <Row label="Cover" c={block.cover} kind="cover" sharePctSigned={false} isTotal={isTotal} />
          <Row label="Average Check" c={block.avgCheck} kind="money" sharePctSigned isTotal={isTotal} />
          <Row label="Revenue" c={block.revenue} kind="money" sharePctSigned={false} isTotal={isTotal} />
        </tbody>
      </table>
    </div>
  );
}

/** Restaurant Sales Performance — per-meal Cover / Average Check / Revenue with
 * Actual · % · Budget · % · Different · % and a TOTAL, matching the deck. */
export function RestaurantSalesTable({ meals }: { meals: MealRow[] }) {
  const t = buildSalesTable(meals);
  return (
    <div className="space-y-4">
      {t.meals.map((b) => (
        <Block key={b.meal} block={b} />
      ))}
      <Block block={t.total} />
    </div>
  );
}
