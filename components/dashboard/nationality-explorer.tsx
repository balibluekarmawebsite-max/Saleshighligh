"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { NationalityMap } from "@/components/charts/nationality-map";
import { MoMBadge } from "@/components/dashboard/mom-badge";
import { momChange } from "@/lib/calculations";
import type { NationalityRank } from "@/lib/dashboard-data";
import { formatNumber, formatPercent } from "@/lib/format";
import { flagEmoji } from "@/lib/geo";
import { cn } from "@/lib/utils";

function RankMove({ move }: { move: number | null }) {
  if (move === null) return <span className="text-muted-foreground">—</span>;
  if (move === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground">
        <Minus className="h-3.5 w-3.5" /> 0
      </span>
    );
  const up = move > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 font-medium", up ? "text-variance-positive" : "text-variance-negative")}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(move)}
    </span>
  );
}

export function NationalityExplorer({ data }: { data: NationalityRank[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3 font-medium">#</th>
              <th className="py-2 pr-4 font-medium">Country</th>
              <th className="py-2 pr-4 text-right font-medium">Room Nights</th>
              <th className="py-2 pr-4 text-right font-medium">Share</th>
              <th className="py-2 pr-4 text-right font-medium">vs LY</th>
              <th className="py-2 text-right font-medium">Rank</th>
            </tr>
          </thead>
          <tbody>
            {data.map((n) => {
              const isSelected = selected === n.countryCode;
              return (
                <tr
                  key={n.countryName}
                  onClick={() => setSelected(isSelected ? null : n.countryCode)}
                  className={cn(
                    "cursor-pointer border-b border-border/60 transition-colors",
                    isSelected ? "bg-accent" : "hover:bg-accent/40",
                  )}
                >
                  <td className="py-2 pr-3 text-muted-foreground">{n.rank}</td>
                  <td className="py-2 pr-4 text-foreground">
                    <span className="mr-2">{flagEmoji(n.countryCode)}</span>
                    {n.countryName}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                    {formatNumber(n.roomNights)}
                  </td>
                  <td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">
                    {formatPercent(n.sharePct)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    {n.lastYearRoomNights !== null ? (
                      <MoMBadge value={momChange(n.roomNights, n.lastYearRoomNights)} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    <RankMove move={n.rankMovement} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="hidden lg:block">
        <NationalityMap
          data={data.map((n) => ({
            countryCode: n.countryCode,
            countryName: n.countryName,
            roomNights: n.roomNights,
            sharePct: n.sharePct,
          }))}
          selectedCode={selected}
        />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Click a country in the table to highlight it on the map.
        </p>
      </div>
    </div>
  );
}
