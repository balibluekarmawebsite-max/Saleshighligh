import { MoMBadge } from "@/components/dashboard/mom-badge";
import { SectionCard } from "@/components/dashboard/section-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import type { TripMetric } from "@/lib/dashboard-data";
import { formatNumber } from "@/lib/format";

/**
 * Tripadvisor listing block shared by the Marketing (hotel) and Restaurant
 * pages. Shows a rank/rating hero and an engagement grid with auto MoM chips.
 */
export function TripadvisorBlock({
  title = "Tripadvisor",
  description,
  rank,
  totalInMarket,
  rating,
  area,
  noun,
  metrics,
}: {
  title?: string;
  description?: string;
  rank: number | null;
  totalInMarket: number | null;
  rating: number | null;
  area: string;
  noun: string; // "hotels" | "restaurants" | …
  metrics: TripMetric[];
}) {
  return (
    <SectionCard title={title} description={description ?? `${noun[0]?.toUpperCase()}${noun.slice(1)} listing performance`}>
      <div className="rounded-lg bg-secondary/50 p-4">
        <p className="text-lg font-semibold text-foreground">
          {rank !== null ? `#${rank}` : "—"}
          {totalInMarket !== null && (
            <span className="font-normal text-muted-foreground"> of {formatNumber(totalInMarket)} {noun} in {area}</span>
          )}
          {rank === null && totalInMarket === null && (
            <span className="font-normal text-muted-foreground">Rating in {area}</span>
          )}
          {rating !== null && (
            <span className="font-normal text-muted-foreground"> · {rating.toFixed(1)}/5</span>
          )}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map((m) => (
          <StatTile
            key={m.key}
            label={m.label}
            value={formatNumber(m.value)}
            sub={m.mom !== null ? <MoMBadge value={m.mom} /> : "no prior month"}
          />
        ))}
      </div>
    </SectionCard>
  );
}
