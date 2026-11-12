import { notFound } from "next/navigation";

import { ActualBudgetBarChart } from "@/components/charts/actual-budget-bar-chart";
import { CoverVsBookingChart } from "@/components/charts/cover-vs-booking-chart";
import { RevenueMixChart } from "@/components/charts/revenue-mix-chart";
import { AdsBlock } from "@/components/dashboard/ads-block";
import { ComingSoon } from "@/components/dashboard/coming-soon";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ExportableCard } from "@/components/dashboard/exportable-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MoMBadge } from "@/components/dashboard/mom-badge";
import { SectionCard } from "@/components/dashboard/section-card";
import { StatTile } from "@/components/dashboard/stat-tile";
import { TripadvisorBlock } from "@/components/dashboard/tripadvisor-block";
import { NarrativePanel } from "@/components/dashboard/narrative-panel";
import { RestaurantOverviewPanel } from "@/components/sales/restaurant-overview-panel";
import { RestaurantAcquisitionUploader } from "@/components/sales/restaurant-acquisition-uploader";
import { RestaurantSalesUploader } from "@/components/sales/restaurant-sales-uploader";
import { RestaurantSourcesUploader } from "@/components/sales/restaurant-sources-uploader";
import { RestaurantSalesTable } from "@/components/tables/restaurant-sales-table";
import { RestaurantSourcesTable } from "@/components/tables/restaurant-sources-table";
import { Card, CardContent } from "@/components/ui/card";
import { achievementPct, variancePct } from "@/lib/calculations";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import {
  GROUP_CODE,
  getRestaurantPageData,
  type GokaiMetric,
} from "@/lib/dashboard-data";
import { formatIDR, formatNumber, formatPercent, formatVariancePercent } from "@/lib/format";
import { periodLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const MEAL_LABEL: Record<string, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", DINNER: "Dinner" };
const CAT_LABEL: Record<string, string> = { IN_HOUSE: "In-House", OUTSIDER: "Outsider", PLATFORM: "Platforms" };
const CAT_ORDER = ["IN_HOUSE", "OUTSIDER", "PLATFORM"];

function Chip({ tone, children }: { tone: "good" | "bad" | "gold"; children: React.ReactNode }) {
  const cls =
    tone === "good"
      ? "border-variance-positive/40 bg-variance-positive/5 text-variance-positive"
      : tone === "bad"
        ? "border-variance-negative/40 bg-variance-negative/5 text-variance-negative"
        : "border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/5 text-[hsl(var(--brand-gold))]";
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", cls)}>
      {children}
    </span>
  );
}

function SectionNote({ title, description, message }: { title: string; description?: string; message: string }) {
  return (
    <SectionCard title={title} description={description}>
      <p className="text-sm text-muted-foreground">{message}</p>
    </SectionCard>
  );
}

function fmtGokai(m: GokaiMetric): string {
  if (m.format === "idr") return formatIDR(m.value);
  if (m.format === "pct") return formatPercent(m.value);
  return formatNumber(m.value);
}

export default async function RestaurantPage({
  params,
}: {
  params: { property: string; period: string };
}) {
  if (params.property === GROUP_CODE) {
    return <ComingSoon title="Group — Restaurant" description="Consolidated view coming soon." />;
  }

  const data = await getRestaurantPageData(params.property, params.period);
  if (!data) notFound();
  if (!data.hasData) {
    return (
      <EmptyState
        title={`No data for ${params.property} · ${periodLabel(params.period)}`}
        message="Import the monthly workbook (F&B / CHOPE / GOKAI / ADS / REPUTATION tabs) to populate this page."
        actionHref="/admin/import"
        actionLabel="Import data"
      />
    );
  }

  const { property, overview, meals, sources, acquisition, acquisitionDaily, acquisitionNarrative, chope, gokai, tripadvisor, narrative } = data;
  const fileBase = `${property.code}-${params.period}-restaurant`;
  const canEdit = canEditProperty(await getCurrentUser(), params.property);

  // Meal-period auto insights
  const mealAch = meals.map((m) => ({
    meal: MEAL_LABEL[m.meal] ?? m.meal,
    ach: achievementPct(m.revenueActual, m.revenueBudget),
    acVar: m.avgCheckActual !== null && m.avgCheckBudget !== null ? variancePct(m.avgCheckActual, m.avgCheckBudget) : null,
  }));
  const rated = mealAch.filter((x) => x.ach !== null);
  const strongest = rated.length ? rated.reduce((a, b) => (b.ach! > a.ach! ? b : a)) : null;
  const weakest = rated.length ? rated.reduce((a, b) => (b.ach! < a.ach! ? b : a)) : null;
  const acRated = mealAch.filter((x) => x.acVar !== null);
  const acOutlier = acRated.length ? acRated.reduce((a, b) => (Math.abs(b.acVar!) > Math.abs(a.acVar!) ? b : a)) : null;

  const mealBarData = meals.map((m) => ({
    label: MEAL_LABEL[m.meal] ?? m.meal,
    actual: m.revenueActual,
    budget: m.revenueBudget,
  }));

  // Source-of-booking covers mix by category
  const catPersons = new Map<string, number>();
  for (const s of sources) catPersons.set(s.category, (catPersons.get(s.category) ?? 0) + s.persons);
  const sourceMix = CAT_ORDER.filter((c) => (catPersons.get(c) ?? 0) > 0).map((c) => ({
    label: CAT_LABEL[c] ?? c,
    value: catPersons.get(c) ?? 0,
  }));

  const bookingsMix = acquisition.map((a) => ({ label: a.label, value: a.bookingsPct }));
  const coversMix = acquisition.map((a) => ({ label: a.label, value: a.coversPct }));
  const coverBookingDaily = acquisitionDaily.map((d) => ({ day: d.day, covers: d.covers, bookings: d.bookings }));
  const hasAcquisition = acquisition.length > 0 || acquisitionDaily.length > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">{property.restaurantName}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {property.name} · Restaurant · {periodLabel(params.period)}
        </p>
      </div>

      {/* 1 — Overview (structured narrative) */}
      <Card>
        <CardContent className="p-6">
          <RestaurantOverviewPanel
            property={params.property}
            period={params.period}
            content={narrative?.content ?? null}
            aiGenerated={narrative?.aiGenerated ?? false}
            canEdit={canEdit}
          />
        </CardContent>
      </Card>

      {/* 1b — KPI strip (shown once the F&B figures are imported) */}
      {overview && (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            label="Total Covers"
            value={formatNumber(overview.covers.actual)}
            deltaPct={variancePct(overview.covers.actual, overview.covers.budget)}
            budgetValue={formatNumber(overview.covers.budget)}
          />
          <KpiCard
            label="Total Revenue"
            value={formatIDR(overview.revenue.actual)}
            deltaPct={variancePct(overview.revenue.actual, overview.revenue.budget)}
            budgetValue={formatIDR(overview.revenue.budget)}
          />
          <KpiCard
            label="Blended Average Check"
            value={overview.avgCheckActual !== null ? formatIDR(overview.avgCheckActual) : "—"}
            deltaPct={
              overview.avgCheckActual !== null && overview.avgCheckBudget !== null
                ? variancePct(overview.avgCheckActual, overview.avgCheckBudget)
                : null
            }
            budgetValue={overview.avgCheckBudget !== null ? formatIDR(overview.avgCheckBudget) : undefined}
          />
          <StatTile
            label="Revenue Achievement"
            value={formatPercent(overview.revenueAchievementPct)}
            sub="of budget"
          />
        </section>
      )}

      {/* 2 — Restaurant Sales Performance */}
      <div className="space-y-6">
        <SectionCard
          title="Restaurant Sales Performance"
          description="Covers, average check and revenue by meal period (Actual · % · Budget · % · Different · %)"
          insight={
            meals.length > 0 && strongest && weakest
              ? `${strongest.meal} led on budget achievement (${strongest.ach!.toFixed(0)}%); ${weakest.meal} lagged (${weakest.ach!.toFixed(0)}%).`
              : undefined
          }
        >
          {canEdit && (
            <div className="mb-1">
              <RestaurantSalesUploader
                property={params.property}
                period={params.period}
                initial={meals}
                hasData={meals.length > 0}
              />
            </div>
          )}
          {meals.length > 0 ? (
            <>
              <RestaurantSalesTable meals={meals} />
              <div className="flex flex-wrap gap-2">
                {strongest && <Chip tone="good">Strongest · {strongest.meal} {strongest.ach!.toFixed(0)}%</Chip>}
                {weakest && <Chip tone="bad">Weakest · {weakest.meal} {weakest.ach!.toFixed(0)}%</Chip>}
                {acOutlier && acOutlier.acVar !== null && (
                  <Chip tone="gold">
                    {acOutlier.meal} avg check {formatVariancePercent(acOutlier.acVar)} vs budget
                  </Chip>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No sales data yet{canEdit ? " — upload a screenshot or paste the table above." : "."}
            </p>
          )}
        </SectionCard>

        {meals.length > 0 && (
          <ExportableCard
            title="Revenue by Meal — Actual vs Budget"
            description="Meal-period revenue against budget"
            fileName={`${fileBase}-meal-revenue`}
          >
            <ActualBudgetBarChart data={mealBarData} />
          </ExportableCard>
        )}
      </div>

      {/* 3 — Source of booking */}
      <SectionCard
        title="Source of Booking"
        description="Persons, % share, average check and revenue by source (In-House · Outsider · Platforms)"
      >
        {canEdit && (
          <div className="mb-1">
            <RestaurantSourcesUploader
              property={params.property}
              period={params.period}
              initial={sources}
              hasData={sources.length > 0}
            />
          </div>
        )}
        {sources.length > 0 ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <ExportableCard title="By Source" description="Persons · % · average check · revenue, with TOTAL" fileName={`${fileBase}-sources`}>
              <RestaurantSourcesTable sources={sources} />
            </ExportableCard>
            <ExportableCard title="Covers Mix" description="In-House vs Outsider vs Platforms" fileName={`${fileBase}-source-mix`}>
              <RevenueMixChart data={sourceMix} valueFormat="number" />
            </ExportableCard>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No source-of-booking data yet{canEdit ? " — upload a screenshot or paste the table above." : "."}
          </p>
        )}
      </SectionCard>

      {/* 4 — Acquisition split */}
      <SectionCard
        title="Acquisition Split"
        description="Booking vs Cover mix by channel, the daily Cover-vs-Booking trend, and a summary"
      >
        {canEdit && (
          <div className="mb-1">
            <RestaurantAcquisitionUploader
              property={params.property}
              period={params.period}
              initialChannels={acquisition}
              initialDaily={acquisitionDaily}
              hasData={hasAcquisition}
            />
          </div>
        )}

        <div className="space-y-6">
          {acquisition.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <ExportableCard title="Booking" description="Share of bookings by channel" fileName={`${fileBase}-acq-bookings`}>
                <RevenueMixChart data={bookingsMix} valueFormat="number" />
              </ExportableCard>
              <ExportableCard title="Cover" description="Share of covers by channel" fileName={`${fileBase}-acq-covers`}>
                <RevenueMixChart data={coversMix} valueFormat="number" />
              </ExportableCard>
            </div>
          )}
          {coverBookingDaily.length > 0 && (
            <ExportableCard title="Cover vs Booking" description="Daily bookings and covers across the month" fileName={`${fileBase}-acq-daily`}>
              <CoverVsBookingChart data={coverBookingDaily} />
            </ExportableCard>
          )}
          {!hasAcquisition && (
            <p className="text-sm text-muted-foreground">
              No acquisition data yet{canEdit ? " — upload a screenshot or paste the channel split / daily table above." : "."}
            </p>
          )}
          {/* Summary always renders (like the other pages) so a saved narrative
              is never orphaned when the numeric data is absent or later cleared. */}
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold text-foreground">Customer Acquisition Breakdown</h3>
            <p className="mt-1 text-xs text-muted-foreground">Bookings &amp; covers distribution with the key performance insight.</p>
            <div className="mt-3">
              <NarrativePanel
                block={acquisitionNarrative}
                section="ACQUISITION_SPLIT"
                property={params.property}
                period={params.period}
                emptyText="No acquisition summary written for this period yet."
              />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* 5 — Chope panel */}
      {chope ? (
        <SectionCard
          title="Chope Reservations"
          description="Reservation funnel, revenue and booking source"
          insight={
            chope.pctOfRestaurantRevenue !== null
              ? `Chope contributed ${chope.pctOfRestaurantRevenue.toFixed(1)}% of restaurant revenue this period.`
              : undefined
          }
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Fulfilled Bookings" value={formatNumber(chope.fulfilledBookings)} sub={`${formatNumber(chope.fulfilledCovers)} covers`} />
            <StatTile label="Cancelled Bookings" value={formatNumber(chope.cancelledBookings)} sub={`${formatNumber(chope.cancelledCovers)} covers`} />
            <StatTile label="No-shows" value={formatNumber(chope.noShows)} />
            <StatTile
              label="Chope Revenue"
              value={formatIDR(chope.revenue)}
              sub={chope.pctOfRestaurantRevenue !== null ? `${chope.pctOfRestaurantRevenue.toFixed(1)}% of restaurant revenue` : undefined}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Booking source · Platform vs Direct</p>
            <div className="flex h-5 w-full overflow-hidden rounded">
              {(() => {
                const total = chope.platformBookings + chope.directBookings;
                const pw = total > 0 ? (chope.platformBookings / total) * 100 : 0;
                return (
                  <>
                    <div style={{ width: `${pw}%`, backgroundColor: "#0F4C5C" }} title={`Platform: ${formatNumber(chope.platformBookings)}`} />
                    <div style={{ width: `${100 - pw}%`, backgroundColor: "#C9A227" }} title={`Direct: ${formatNumber(chope.directBookings)}`} />
                  </>
                );
              })()}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#0F4C5C" }} />
                Platform · {formatNumber(chope.platformBookings)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#C9A227" }} />
                Direct · {formatNumber(chope.directBookings)}
              </span>
            </div>
          </div>
        </SectionCard>
      ) : (
        <SectionNote title="Chope Reservations" description="Reservation funnel and revenue" message="No Chope report for this period yet." />
      )}

      {/* 6 — Gokai panel */}
      {gokai ? (
        <SectionCard
          title="Gokai CRM"
          description={`Email, engagement and upsell${gokai.unit === "HOTEL" ? " (hotel-level)" : ""}`}
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gokai.metrics.map((m) => (
              <StatTile
                key={m.key}
                label={m.label}
                value={fmtGokai(m)}
                sub={m.mom !== null ? <MoMBadge value={m.mom} /> : "no prior month"}
              />
            ))}
          </div>
        </SectionCard>
      ) : (
        <SectionNote title="Gokai CRM" description="Email, engagement and upsell" message="No Gokai report for this period yet." />
      )}

      {/* 7 — Restaurant ads */}
      <div>
        <h3 className="mb-3 text-lg font-semibold tracking-tight text-foreground">Restaurant Ads</h3>
        <AdsBlock
          ads={data.ads}
          spendRevenue={data.spendRevenue}
          roasTrend={data.roasTrend}
          fileBase={`${fileBase}-ads`}
          emptyLabel="Import the ADS tab (RESTAURANT unit) to populate ad performance."
        />
      </div>

      {/* 8 — Restaurant Tripadvisor */}
      {tripadvisor ? (
        <TripadvisorBlock
          title="Restaurant Tripadvisor"
          rank={tripadvisor.rank}
          totalInMarket={tripadvisor.totalInMarket}
          rating={tripadvisor.rating}
          area={tripadvisor.area}
          noun={tripadvisor.noun}
          metrics={tripadvisor.metrics}
        />
      ) : (
        <SectionNote title="Restaurant Tripadvisor" description="Listing performance" message="No restaurant Tripadvisor data for this period yet." />
      )}

    </div>
  );
}
