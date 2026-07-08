import { ActualBudgetBarChart } from "@/components/charts/actual-budget-bar-chart";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PropertySwitcher } from "@/components/dashboard/property-switcher";
import { RevenueVarianceTable } from "@/components/tables/revenue-variance-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getExecutiveSummary, getProperties } from "@/lib/dashboard-data";

// Reads live data per request; never statically prerendered.
export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatPeriod(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Shorten long segment names for chart axis labels. */
function shortSegment(name: string): string {
  const map: Record<string, string> = {
    "OTA (Online Travel Agent)": "OTA",
    "OTA (Wellness)": "OTA Well.",
    "Direct Booking": "Direct",
    "Group Wellness": "Grp Well.",
  };
  return map[name] ?? name;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const properties = await getProperties();
  const requested =
    typeof searchParams.property === "string" ? searchParams.property : undefined;
  const activeCode =
    properties.find((p) => p.code === requested)?.code ??
    properties[0]?.code ??
    "BKDS";

  const summary = await getExecutiveSummary(activeCode);

  if (!summary || !summary.period) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {properties.length > 0 && (
          <PropertySwitcher properties={properties} activeCode={activeCode} />
        )}
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No report data yet for {activeCode}. Seed a report period to see the
            executive summary.
          </CardContent>
        </Card>
      </div>
    );
  }

  const departmentChart = summary.departments.map((d) => ({
    label: d.label,
    actual: d.actual,
    budget: d.budget,
  }));

  const departmentRows = [
    ...summary.departments.map((d) => ({
      label: d.label,
      actual: d.actual,
      budget: d.budget,
    })),
    ...(summary.totalRevenue
      ? [
          {
            label: "Total Revenue",
            actual: summary.totalRevenue.actual,
            budget: summary.totalRevenue.budget,
          },
        ]
      : []),
  ];

  const segmentChart = summary.segments.map((s) => ({
    label: shortSegment(s.segmentName),
    actual: s.actualRevenue,
    budget: s.budgetRevenue,
  }));

  const segmentRows = summary.segments.map((s) => ({
    label: s.segmentName,
    actual: s.actualRevenue,
    budget: s.budgetRevenue,
  }));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              {summary.property.name}
            </h2>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {summary.status === "FINAL" ? "Final" : "Draft"}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {summary.property.area} · {summary.property.roomCount} rooms ·{" "}
            <span className="font-medium text-foreground">
              {formatPeriod(summary.period)}
            </span>
          </p>
        </div>
        <PropertySwitcher properties={properties} activeCode={activeCode} />
      </div>

      {/* KPIs */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Occupancy" metric={summary.occupancy} kind="percent" />
        <KpiCard label="ADR" metric={summary.adr} kind="currency" />
        <KpiCard label="RevPAR" metric={summary.revpar} kind="currency" />
        <KpiCard
          label="Total Revenue"
          metric={summary.totalRevenue}
          kind="currency"
        />
      </section>

      {/* Department revenue */}
      <Card>
        <CardHeader>
          <CardTitle>Revenue by Department</CardTitle>
          <CardDescription>Actual vs budget — {formatPeriod(summary.period)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {departmentChart.length > 0 && (
            <ActualBudgetBarChart data={departmentChart} />
          )}
          <RevenueVarianceTable rows={departmentRows} emphasizeLast />
        </CardContent>
      </Card>

      {/* Market segment */}
      <Card>
        <CardHeader>
          <CardTitle>Rooms — Market Segment</CardTitle>
          <CardDescription>
            Room revenue by segment, actual vs budget (MTD)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {segmentChart.length > 0 ? (
            <>
              <ActualBudgetBarChart data={segmentChart} />
              <RevenueVarianceTable
                rows={segmentRows}
                firstColumnHeader="Segment"
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No market-segment data for this period.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
