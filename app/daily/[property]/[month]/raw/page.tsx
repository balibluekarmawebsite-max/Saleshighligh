import { notFound } from "next/navigation";

import { SectionCard } from "@/components/dashboard/section-card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { RawOccupancyGrid } from "@/components/daily/raw-occupancy-grid";
import { getRawDailyData, type RawPushInfo } from "@/lib/daily/raw-data";
import { formatNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Render a UTC ISO datetime as Bali (WITA, UTC+8) wall-clock, for the push log. */
function witaStamp(iso: string): string {
  const w = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  return `${w.toISOString().slice(0, 16).replace("T", " ")} WITA`;
}

/** Compact one-line summary of a push's stored detail (known keys only). */
function pushSummary(detail: RawPushInfo["detail"]): string {
  if (!detail) return "";
  const d = detail;
  const parts: string[] = [];
  const date = d.snapshotDate ?? d.date;
  if (date) parts.push(`date ${String(date)}`);
  if (d.rows != null) parts.push(`${d.rows} stay-month(s)`);
  if (d.pickups != null) parts.push(`${d.pickups} agent(s)`);
  if (d.arrivals != null) parts.push(`${d.arrivals} arrival day(s)`);
  if (d.departures != null) parts.push(`${d.departures} departure day(s)`);
  if (d.excludedSameDay != null && Number(d.excludedSameDay) > 0) parts.push(`${d.excludedSameDay} same-day cancel excluded`);
  if (d.skippedInvalid != null && Number(d.skippedInvalid) > 0) parts.push(`${d.skippedInvalid} invalid skipped`);
  if (d.source) parts.push(`source: ${String(d.source)}`);
  return parts.join(" · ");
}

export default async function RawDataPage({ params }: { params: { property: string; month: string } }) {
  const data = await getRawDailyData(params.property, params.month);
  if (!data) notFound();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Raw Data (VHP scraper)</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {data.property.name} · {data.monthLabel}. This is <span className="font-medium text-foreground">exactly what the
            VHP scraper pushed</span>, before any dashboard calculation. Compare these numbers against your VHP export to
            see where a figure differs — e.g. if <span className="font-medium text-foreground">Room Occupied</span> is
            higher than your report, the scraper is likely still counting Compliment / House Use rooms.
          </p>
        </div>
        <a
          href={`/api/daily/export?property=${encodeURIComponent(data.property.code)}`}
          className="shrink-0 rounded-md border border-brand-teal bg-brand-teal px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90"
        >
          Download Excel
        </a>
      </div>

      {/* What arrived, and when */}
      <SectionCard title="Last received from the scraper" description="Most recent pushes for this property (newest first)">
        {data.pushes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pushes recorded for this property yet.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-sm">
            {data.pushes.map((p, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
                <span className="font-medium text-foreground">{p.feed}</span>
                <span className="tabular-nums text-xs text-muted-foreground">{witaStamp(p.at)}</span>
                {pushSummary(p.detail) ? (
                  <span className="w-full text-xs text-muted-foreground">{pushSummary(p.detail)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Occupancy — the raw Room Occupied / Saleable / Revenue the % is built from */}
      <SectionCard
        title="Occupancy — raw forecast values"
        description="Rows = snapshot dates (newest first), columns = stay months. Switch the metric to inspect Room Occupied, Saleable Rooms, Occupancy % or Room Revenue."
      >
        <RawOccupancyGrid
          columns={data.occColumns}
          rows={data.occRows}
          latestSnapshotDate={data.latestSnapshotDate}
        />
      </SectionCard>

      {/* Reservation pickup, raw per agent */}
      <SectionCard title="Reservation pickup — raw rows" description="New reservations by agent, as stored per pickup date (newest first)">
        {data.pickups.length === 0 ? (
          <EmptyState title="No pickup rows" message="The Reservation feed hasn't sent pickup rows for this month." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-brand-teal text-white">
                  <th className="px-3 py-2 text-left font-semibold">Pickup date</th>
                  <th className="px-3 py-2 text-left font-semibold">Agent / source</th>
                  <th className="px-3 py-2 text-right font-semibold">Room nights</th>
                  <th className="px-3 py-2 text-right font-semibold">Reservations</th>
                </tr>
              </thead>
              <tbody>
                {data.pickups.map((p, i) => (
                  <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{p.pickupDate}</td>
                    <td className="px-3 py-1.5 text-foreground">{p.agent}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">{formatNumber(p.roomNights)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                      {p.reservations == null ? "—" : formatNumber(p.reservations)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {/* Arrivals / departures, raw per stay date */}
      <SectionCard title="Arrivals & departures — raw rows" description="Room movement by stay date, as stored">
        {data.flow.length === 0 ? (
          <EmptyState title="No arrival/departure rows" message="The Reservation / Room Departure feeds haven't sent movement rows for this month." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-brand-teal text-white">
                  <th className="px-3 py-2 text-left font-semibold">Stay date</th>
                  <th className="px-3 py-2 text-right font-semibold">Arrival rooms</th>
                  <th className="px-3 py-2 text-right font-semibold">Departure rooms</th>
                </tr>
              </thead>
              <tbody>
                {data.flow.map((f, i) => (
                  <tr key={i} className="border-b border-border/60 hover:bg-muted/40">
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{f.stayDate}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                      {f.arrivalRooms == null ? "—" : formatNumber(f.arrivalRooms)}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-foreground">
                      {f.departureRooms == null ? "—" : formatNumber(f.departureRooms)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
