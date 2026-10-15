import Link from "next/link";

import { AnnualBaseline } from "@/components/weekly/sections/annual-baseline";
import { BaselineUpload } from "@/components/weekly/sections/baseline-upload";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { weeklyHref } from "@/lib/nav";
import { prisma } from "@/lib/prisma";
import { getAnnualBudget, type AnnualBudgetMonth } from "@/lib/weekly/annual-budget";
import { getAnnualLastYear } from "@/lib/weekly/annual-lastyear";
import { MONTHS_FULL } from "@/lib/weekly/editor-data";
import { weekMeta } from "@/lib/weekly/week";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const pctFracStr = (f: number | null): string =>
  f == null ? "" : String(Math.round(f * 100 * 100) / 100);
const numStr = (n: number | null): string => (n == null ? "" : String(n));

type Month = Pick<AnnualBudgetMonth, "occFraction" | "arr" | "revenue" | "rnSold">;

function buildRows(map: Map<number, Month>) {
  return MONTHS_FULL.map((label, i) => {
    const v = map.get(i + 1);
    return {
      month: String(i + 1),
      monthLabel: label,
      occ: pctFracStr(v?.occFraction ?? null),
      arr: numStr(v?.arr ?? null),
      revenue: numStr(v?.revenue ?? null),
      rnSold: numStr(v?.rnSold ?? null),
    };
  });
}

export default async function WeeklyBaselinePage({
  params,
  searchParams,
}: {
  params: { property: string; week: string };
  searchParams: { year?: string };
}) {
  const property = params.property.toUpperCase();
  const prop = await prisma.property.findUnique({
    where: { code: property },
    select: { id: true, name: true },
  });

  if (!prop) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
        Unknown property {property}.
      </div>
    );
  }

  const defaultYear = weekMeta(params.week)?.year ?? new Date().getUTCFullYear();
  const requested = Number(searchParams.year);
  const year =
    Number.isInteger(requested) && requested >= 2000 && requested <= 2100 ? requested : defaultYear;

  const user = await getCurrentUser();
  const canEdit = canEditProperty(user, property);

  const [budget, lastyear, reportYears, budgetYears, lyYears] = await Promise.all([
    getAnnualBudget(prop.id, year),
    getAnnualLastYear(prop.id, year),
    prisma.weeklyReport.findMany({ where: { propertyId: prop.id }, distinct: ["year"], select: { year: true } }),
    prisma.weeklyBudget.findMany({ where: { propertyId: prop.id }, distinct: ["year"], select: { year: true } }),
    prisma.weeklyLastYear.findMany({ where: { propertyId: prop.id }, distinct: ["year"], select: { year: true } }),
  ]);

  const years = Array.from(
    new Set<number>([
      year,
      defaultYear,
      ...reportYears.map((r) => r.year),
      ...budgetYears.map((r) => r.year),
      ...lyYears.map((r) => r.year),
    ]),
  ).sort((a, b) => b - a);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Budget &amp; Last Year</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {prop.name} — the fixed yearly Budget and Last Year figures that feed Section B of every
          weekly report. Enter them once per year; they never change week to week.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Year</span>
        {years.map((y) => (
          <Link
            key={y}
            href={`${weeklyHref(property, params.week, "baseline")}?year=${y}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              y === year
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-secondary",
            )}
          >
            {y}
          </Link>
        ))}
      </div>

      <BaselineUpload property={property} year={year} locked={!canEdit} />

      <AnnualBaseline
        property={property}
        year={year}
        budget={buildRows(budget)}
        lastyear={buildRows(lastyear)}
        locked={!canEdit}
      />
    </div>
  );
}
