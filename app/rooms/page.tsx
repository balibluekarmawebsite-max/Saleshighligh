import { ActualBudgetBarChart } from "@/components/charts/actual-budget-bar-chart";
import { PropertySwitcher } from "@/components/dashboard/property-switcher";
import { RevenueVarianceTable } from "@/components/tables/revenue-variance-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { variancePct } from "@/lib/calculations";
import {
  getProperties,
  getRoomsSummary,
  resolveActiveCode,
} from "@/lib/dashboard-data";
import {
  formatIDR,
  formatNumber,
  formatPercent,
  formatVariancePercent,
  varianceColorClass,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatPeriod(date: Date): string {
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function shortSegment(name: string): string {
  const map: Record<string, string> = {
    "OTA (Online Travel Agent)": "OTA",
    "OTA (Wellness)": "OTA Well.",
    "Direct Booking": "Direct",
    "Group Wellness": "Grp Well.",
  };
  return map[name] ?? name;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  OTA: "OTA",
  TA: "Travel Agent",
  CORPORATE: "Corporate",
  WHOLESALER: "Wholesaler",
};

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export default async function RoomsPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const properties = await getProperties();
  const activeCode = resolveActiveCode(properties, searchParams.property);
  const rooms = await getRoomsSummary(activeCode);

  if (!rooms || !rooms.period) {
    return (
      <div className="mx-auto max-w-6xl space-y-6">
        {properties.length > 0 && (
          <PropertySwitcher properties={properties} activeCode={activeCode} />
        )}
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No rooms data yet for {activeCode}.
          </CardContent>
        </Card>
      </div>
    );
  }

  const segmentChart = rooms.segments.map((s) => ({
    label: shortSegment(s.segmentName),
    actual: s.actualRevenue,
    budget: s.budgetRevenue,
  }));
  const segmentRows = rooms.segments.map((s) => ({
    label: s.segmentName,
    actual: s.actualRevenue,
    budget: s.budgetRevenue,
  }));

  const nationalityTotal = rooms.nationalities.reduce(
    (sum, n) => sum + n.roomNights,
    0,
  );
  const losTotal = rooms.lengthOfStay.reduce((s, l) => s + l.roomNights, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            {rooms.property.name}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {rooms.property.area} · {rooms.property.roomCount} rooms ·{" "}
            <span className="font-medium text-foreground">
              {formatPeriod(rooms.period)}
            </span>
          </p>
        </div>
        <PropertySwitcher properties={properties} activeCode={activeCode} />
      </div>

      {/* Market segment */}
      <Card>
        <CardHeader>
          <CardTitle>Market Segment</CardTitle>
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
            <EmptyNote>No market-segment data for this period.</EmptyNote>
          )}
        </CardContent>
      </Card>

      {/* Room type */}
      <Card>
        <CardHeader>
          <CardTitle>Room Type Production</CardTitle>
          <CardDescription>Actual vs budget by room type</CardDescription>
        </CardHeader>
        <CardContent>
          {rooms.roomTypes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Room Type</th>
                    <th className="py-2 pr-4 text-right font-medium">Room Nights</th>
                    <th className="py-2 pr-4 text-right font-medium">ADR</th>
                    <th className="py-2 pr-4 text-right font-medium">Revenue</th>
                    <th className="py-2 text-right font-medium">Var %</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.roomTypes.map((r) => {
                    const v = variancePct(r.revenueActual, r.revenueBudget);
                    return (
                      <tr key={r.roomTypeName} className="border-b border-border/60">
                        <td className="py-2 pr-4 text-foreground">{r.roomTypeName}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                          {formatNumber(r.roomNightsActual)}
                          <span className="text-muted-foreground">
                            {" "}/ {formatNumber(r.roomNightsBudget)}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                          {formatIDR(r.adrActual)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                          {formatIDR(r.revenueActual)}
                        </td>
                        <td className={cn("py-2 text-right tabular-nums", varianceColorClass(v))}>
                          {formatVariancePercent(v)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyNote>
              No room-type breakdown for {rooms.property.code} this period.
            </EmptyNote>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Nationality */}
        <Card>
          <CardHeader>
            <CardTitle>Top Nationalities</CardTitle>
            <CardDescription>Room nights by guest nationality (MTD)</CardDescription>
          </CardHeader>
          <CardContent>
            {rooms.nationalities.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">#</th>
                      <th className="py-2 pr-4 font-medium">Nationality</th>
                      <th className="py-2 pr-4 text-right font-medium">Room Nights</th>
                      <th className="py-2 text-right font-medium">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rooms.nationalities.map((n) => (
                      <tr key={n.countryName} className="border-b border-border/60">
                        <td className="py-2 pr-4 text-muted-foreground">{n.rank}</td>
                        <td className="py-2 pr-4 text-foreground">{n.countryName}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                          {formatNumber(n.roomNights)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {nationalityTotal > 0
                            ? formatPercent((n.roomNights / nationalityTotal) * 100)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyNote>
                No nationality breakdown for {rooms.property.code} this period.
              </EmptyNote>
            )}
          </CardContent>
        </Card>

        {/* Length of stay */}
        <Card>
          <CardHeader>
            <CardTitle>Length of Stay</CardTitle>
            <CardDescription>Bookings and room nights by nights stayed</CardDescription>
          </CardHeader>
          <CardContent>
            {rooms.lengthOfStay.length > 0 ? (
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
                    {rooms.lengthOfStay.map((l) => (
                      <tr key={l.losBucket} className="border-b border-border/60">
                        <td className="py-2 pr-4 text-foreground">{l.losBucket}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                          {formatNumber(l.bookings)}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                          {formatNumber(l.roomNights)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {losTotal > 0
                            ? formatPercent((l.roomNights / losTotal) * 100)
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyNote>
                No length-of-stay data for {rooms.property.code} this period.
              </EmptyNote>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Account production */}
      <Card>
        <CardHeader>
          <CardTitle>Top Account Production</CardTitle>
          <CardDescription>Room nights and revenue by account (YTD)</CardDescription>
        </CardHeader>
        <CardContent>
          {rooms.accounts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Account</th>
                    <th className="py-2 pr-4 font-medium">Type</th>
                    <th className="py-2 pr-4 text-right font-medium">Room Nights</th>
                    <th className="py-2 text-right font-medium">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rooms.accounts.map((a) => (
                    <tr key={a.accountName} className="border-b border-border/60">
                      <td className="py-2 pr-4 text-foreground">{a.accountName}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[a.accountType] ?? a.accountType}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums text-foreground">
                        {formatNumber(a.roomNights)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-foreground">
                        {formatIDR(a.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyNote>
              No account production for {rooms.property.code} this period.
            </EmptyNote>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
