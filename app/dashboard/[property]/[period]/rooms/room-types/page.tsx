import { notFound } from "next/navigation";

import { RevenueBulletList } from "@/components/charts/revenue-bullet-list";
import {
  RoomTypeQuadrantChart,
  type QuadrantPoint,
} from "@/components/charts/room-type-quadrant-chart";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { NarrativePanel } from "@/components/dashboard/narrative-panel";
import { SectionCard } from "@/components/dashboard/section-card";
import { RoomTypeTable } from "@/components/tables/room-type-table";
import { achievementPct } from "@/lib/calculations";
import { GROUP_CODE, getRoomTypesPageData } from "@/lib/dashboard-data";
import { formatIDR, formatIDRCompact, formatNumber, formatPercent } from "@/lib/format";
import { periodLabel } from "@/lib/labels";

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
        message="Import the monthly workbook (ROOMTYPE tab) to populate this page."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const rooms = data.roomTypes;

  // Quadrant points (skip rows with a zero budget denominator).
  const points: QuadrantPoint[] = rooms
    .map((r) => {
      const x = achievementPct(r.roomNightsActual, r.roomNightsBudget);
      const y = achievementPct(r.adrActual, r.adrBudget);
      if (x === null || y === null) return null;
      return { name: r.roomTypeName, x, y, z: r.revenueActual };
    })
    .filter((p): p is QuadrantPoint => p !== null);

  // Rule-based insights.
  const withGap = rooms.map((r) => ({ ...r, gap: r.revenueActual - r.revenueBudget }));
  const best = [...withGap].sort((a, b) => b.gap - a.gap)[0]!;
  const worst = [...withGap].sort((a, b) => a.gap - b.gap)[0]!;
  const totalA = rooms.reduce((s, r) => s + r.revenueActual, 0);
  const totalB = rooms.reduce((s, r) => s + r.revenueBudget, 0);
  const totalGap = totalA - totalB;
  const contributors = [...withGap]
    .filter((r) => r.gap < 0)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 2);

  const bestAch = achievementPct(best.revenueActual, best.revenueBudget);
  const insights = [
    `Best performing: ${best.roomTypeName} — ${bestAch === null ? "—" : formatPercent(bestAch)} of budget (${formatIDRCompact(best.revenueActual)}).`,
    `Largest deficit: ${worst.roomTypeName}: ${worst.gap < 0 ? "−" : "+"}${formatIDRCompact(Math.abs(worst.gap))}, driven by RN ${formatNumber(worst.roomNightsActual)} vs ${formatNumber(worst.roomNightsBudget)} and ADR ${formatIDRCompact(worst.adrActual)} vs ${formatIDRCompact(worst.adrBudget)}.`,
    `Overall: total room revenue ${formatIDR(totalA)} vs budget ${formatIDR(totalB)} — gap ${totalGap < 0 ? "−" : "+"}${formatIDRCompact(Math.abs(totalGap))}.` +
      (contributors.length > 0
        ? ` Top gap contributors: ${contributors.map((c) => `${c.roomTypeName} (−${formatIDRCompact(Math.abs(c.gap))})`).join(", ")}.`
        : ""),
  ];

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
        description="Room nights, ADR and revenue vs budget"
        fileName={`${fileBase}-table`}
      >
        <RoomTypeTable rows={rooms} />
      </ExportableCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ExportableCard
          title="Revenue vs Budget"
          description="Actual bar with budget target marker"
          fileName={`${fileBase}-bullets`}
        >
          <RevenueBulletList
            items={rooms.map((r) => ({ label: r.roomTypeName, actual: r.revenueActual, budget: r.revenueBudget }))}
          />
        </ExportableCard>

        <ExportableCard
          title="RN vs ADR Achievement"
          description="Bubble size = revenue; quadrants classify each room type"
          fileName={`${fileBase}-quadrant`}
        >
          {points.length > 0 ? (
            <RoomTypeQuadrantChart points={points} />
          ) : (
            <p className="text-sm text-muted-foreground">Not enough data to plot quadrants.</p>
          )}
        </ExportableCard>
      </div>

      <SectionCard
        title="Room Type Analysis"
        description="Auto-generated from the numbers — no AI"
      >
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
