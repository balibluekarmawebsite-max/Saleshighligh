import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { formatVariancePercent, varianceColorClass } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A signed, colored percentage delta with a trend arrow (e.g. "+23.4% ▲"). */
export function MoMBadge({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  const invalid = value === null || value === undefined || Number.isNaN(value);
  const Arrow = invalid || value === 0 ? Minus : value! > 0 ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-medium tabular-nums",
        varianceColorClass(invalid ? null : value),
        className,
      )}
    >
      {formatVariancePercent(invalid ? null : value)}
      {!invalid && <Arrow className="h-3.5 w-3.5" aria-hidden />}
    </span>
  );
}
