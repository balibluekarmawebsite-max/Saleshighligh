import { notFound } from "next/navigation";

import { RevenueMixChart } from "@/components/charts/revenue-mix-chart";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { NarrativePanel } from "@/components/dashboard/narrative-panel";
import { SectionCard } from "@/components/dashboard/section-card";
import { RoomTypeTable } from "@/components/tables/room-type-table";
import { GROUP_CODE, getRoomTypesPageData } from "@/lib/dashboard-data";
import { formatIDR, formatIDRCompact, formatNumber, formatPercent } from "@/lib/format";
import { periodLabel, shortSegment } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function RoomTypesPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Room Types" description="Consolidated view coming soon." />;
  }

  const data = await getRoomTypesPageData(params.property, params.period);
  if (!data) notFound();

  if (!data.hasData || data.roomTypes.length === 0) {
    return (
      <EmptyState
        title={`No room-type data for ${params.property} · ${periodLabel(params.period)}`}
        message="The VHP Forecast Room-by-Room-Type feed (or the monthly workbook) populates this page."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const rooms = data.roomTypes; // sorted by revenue desc
  const top = rooms[0]!;
  const topAdr = [...rooms].sort((a, b) => b.adrActual - a.adrActual)[0]!;
  const totalRev = rooms.reduce((s, r) => s + r.revenueActual, 0);
  const totalRN = rooms.reduce((s, r) => s + r.roomNightsActual, 0);
  const blendedAdr = totalRN > 0 ? totalRev / totalRN : 0;

  const insights = [
    `Top revenue: ${top.roomTypeName} — ${formatIDRCompact(top.revenueActual)} (${formatPercent(top.pctOfRevenue)} of room revenue).`,
    `Highest ADR: ${topAdr.roomTypeName} at ${formatIDR(topAdr.adrActual)}.`,
    `Total: ${formatNumber(totalRN)} room nights · ${formatIDR(totalRev)} revenue · blended ADR ${formatIDR(blendedAdr)}.`,
  ];

  const revMix = rooms.filter((r) => r.revenueActual > 0).map((r) => ({ label: shortSegment(r.roomTypeName), value: r.revenueActual }));
  const rnMix = rooms.filter((r) => r.roomNightsActual > 0).map((r) => ({ label: shortSegment(r.roomTypeName), value: r.roomNightsActual }));

  const fileBase = `${data.property.code}-${params.period}-room-types`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {data.property.name}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Room Types · {periodLabel(params.period)}
        </p>
      </div>

      <ExportableCard
        title="Room Type Production"
        description="Room nights, ADR and revenue"
        fileName={`${fileBase}-table`}
      >
        <RoomTypeTable rows={rooms} />
      </ExportableCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExportableCard
          title="Revenue by Room Type"
          description="Share of room revenue"
          fileName={`${fileBase}-revenue-mix`}
        >
          {revMix.length > 0 ? (
            <RevenueMixChart data={revMix} valueFormat="idr" />
          ) : (
            <p className="text-sm text-muted-foreground">No revenue data.</p>
          )}
        </ExportableCard>

        <ExportableCard
          title="Room Nights Mix"
          description="Share of room nights by room type"
          fileName={`${fileBase}-rn-mix`}
        >
          {rnMix.length > 0 ? (
            <RevenueMixChart data={rnMix} valueFormat="number" />
          ) : (
            <p className="text-sm text-muted-foreground">No room-night data.</p>
          )}
        </ExportableCard>
      </div>

      <SectionCard title="Room Type Analysis" description="Auto-generated from the numbers — no AI">
        <ul className="list-disc space-y-2 pl-5 text-sm text-foreground">
          {insights.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Narrative" description="Room Type Analytic write-up">
        <NarrativePanel
          block={data.narrative}
          section="ROOMTYPE_ANALYSIS"
          property={params.property}
          period={params.period}
        />
      </SectionCard>
    </div>
  );
}
