import { notFound } from "next/navigation";

import { LosChart } from "@/components/charts/los-chart";
import { NationalityBarChart } from "@/components/charts/nationality-bar-chart";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { NationalityExplorer } from "@/components/dashboard/nationality-explorer";
import { SectionCard } from "@/components/dashboard/section-card";
import { GROUP_CODE, getGuestsPageData } from "@/lib/dashboard-data";
import { formatNumber, formatPercent } from "@/lib/format";
import { periodLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function GuestsPage({
  params,
  searchParams,
}: {
  params: { property: string; period: string };
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Guests & Geography" description="Consolidated view coming soon." />;
  }

  const scope = searchParams.scope === "ytd" ? "YTD" : "MTD";
  const data = await getGuestsPageData(params.property, params.period, scope);
  if (!data) notFound();

  if (!data.hasData || (data.nationalities.length === 0 && data.losBuckets.length === 0)) {
    return (
      <EmptyState
        title={`No guest data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook (nationality / LOS tabs) to populate this page."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const topNats = data.nationalities.slice(0, 10).map((n) => ({
    name: n.countryName,
    thisYear: n.roomNights,
    lastYear: n.lastYearRoomNights,
  }));
  const losChart = data.losBuckets.map((b) => ({
    bucket: b.bucket,
    thisYear: b.roomNights,
    lastYear: b.lastYearRoomNights,
  }));
  const fileBase = `${data.property.code}-${params.period}`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {data.property.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Guests, Geography &amp; Length of Stay · {periodLabel(params.period)} ·{" "}
          <span className="font-medium text-foreground">{scope}</span>
        </p>
      </div>

      {/* Nationality + map */}
      <SectionCard title="Nationality & Geography" description="Room nights by guest nationality">
        {data.nationalities.length > 0 ? (
          <NationalityExplorer data={data.nationalities} />
        ) : (
          <p className="text-sm text-muted-foreground">No nationality data for this period.</p>
        )}
      </SectionCard>

      {/* Top 10 bar */}
      <ExportableCard
        title="Top 10 Nationalities"
        description="Room nights, this year vs last year"
        fileName={`${fileBase}-top-nationalities`}
      >
        {topNats.length > 0 ? (
          <NationalityBarChart data={topNats} />
        ) : (
          <p className="text-sm text-muted-foreground">No data.</p>
        )}
      </ExportableCard>

      {/* Length of stay */}
      <ExportableCard
        title="Length of Stay"
        description="Room nights by nights stayed"
        fileName={`${fileBase}-length-of-stay`}
      >
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            Avg LOS: {data.avgLos !== null ? `${data.avgLos.toFixed(2)} nights` : "—"}
          </span>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            3+ nights: {data.share3Plus !== null ? formatPercent(data.share3Plus) : "—"}
          </span>
          <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            Dominant: {data.dominantBucket ? `${data.dominantBucket} night(s)` : "—"}
          </span>
        </div>

        {losChart.length > 0 ? (
          <LosChart data={losChart} />
        ) : (
          <p className="text-sm text-muted-foreground">No length-of-stay data for this period.</p>
        )}

        {data.losBuckets.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Nights</th>
                  <th className="py-2 pr-4 text-right font-medium">Bookings</th>
                  <th className="py-2 pr-4 text-right font-medium">Room Nights</th>
                  <th className="py-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.losBuckets.map((b) => (
                  <tr key={b.bucket} className="border-b border-border/60">
                    <td className="py-2 pr-4 text-foreground">{b.bucket}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatNumber(b.bookings)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-foreground">{formatNumber(b.roomNights)}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{formatPercent(b.sharePct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ExportableCard>
    </div>
  );
}
