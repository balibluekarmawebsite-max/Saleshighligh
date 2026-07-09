import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { formatVariancePercent, varianceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * A signed, colored delta with a trend arrow. `unit` "%" renders "+23.4%";
 * "pts" renders "+2.15 pts" (for percentage-point differences like occupancy).
 */
export function MoMBadge({
  value,
  unit = "%",
  className,
}: {
  value: number | null | undefined;
  unit?: "%" | "pts";
  className?: string;
}) {
  const invalid = value === null || value === undefined || Number.isNaN(value);
  const Arrow = invalid || value === 0 ? Minus : value! > 0 ? ArrowUp : ArrowDown;

  const text = invalid
    ? "—"
    : unit === "pts"
      ? `${value! > 0 ? "+" : ""}${value!.toFixed(2)} pts`
      : formatVariancePercent(value);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        varianceColorClass(invalid ? null : value),
        className,
      )}
    >
      {text}
      {!invalid && <Arrow className="h-3.5 w-3.5" aria-hidden />}
    </span>
  );
}
