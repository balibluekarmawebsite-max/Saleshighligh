import Link from "next/link";
import { AlertCircle, ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AdsEditor } from "@/components/weekly/ads-editor";
import { ScreenshotManager } from "@/components/weekly/screenshot-manager";
import { WeeklyEditorShell, type EditorSectionTab } from "@/components/weekly/editor-shell";
import { ActivitiesCards } from "@/components/weekly/sections/activities-cards";
import { ChannelsGrid } from "@/components/weekly/sections/channels-grid";
import { MonthlyGrid } from "@/components/weekly/sections/monthly-grid";
import { OverviewSection } from "@/components/weekly/sections/overview-section";
import { OwnerOverview } from "@/components/weekly/sections/owner-overview";
import { PlansCards } from "@/components/weekly/sections/plans-cards";
import { ProductionGrid } from "@/components/weekly/sections/production-grid";
import { SocialGrid } from "@/components/weekly/sections/social-grid";
import { TrainingTable } from "@/components/weekly/sections/training-table";
import { canEditProperty, getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { weeklyHref } from "@/lib/nav";
import { getWeeklyAds } from "@/lib/weekly/ads-data";
import {
  saveRateCodes,
  saveSegments,
  createWeek,
  setStatus,
} from "@/lib/weekly/editor-actions";
import { getWeeklyFullEditorData } from "@/lib/weekly/editor-data";
import { getWeeklyScreenshots } from "@/lib/weekly/screenshot-data";
import { weekLabel } from "@/lib/weekly/week";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-secondary text-secondary-foreground",
  IN_PROGRESS: "bg-[hsl(var(--brand-gold))]/15 text-[hsl(var(--brand-gold))]",
  READY_FOR_REVIEW: "bg-blue-100 text-blue-700",
  APPROVED: "bg-variance-positive/10 text-variance-positive",
  EXPORTED: "bg-primary/10 text-primary",
};

function StatusForm({
  property,
  week,
  target,
  label,
  variant = "secondary",
}: {
  property: string;
  week: string;
  target: string;
  label: string;
  variant?: "default" | "secondary" | "outline";
}) {
  return (
    <form action={setStatus}>
      <input type="hidden" name="property" value={property} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="target" value={target} />
      <Button type="submit" variant={variant} size="sm">
        {label}
      </Button>
    </form>
  );
}

export default async function WeeklyEditorPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const data = await getWeeklyFullEditorData(params.property, params.week);
  const user = await getCurrentUser();
  const canEdit = canEditProperty(user, params.property);
  const admin = isAdmin(user);
  const p = params.property;
  const w = params.week;

  if (!data.week) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
        <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">No report for this week</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {weekLabel(w)} doesn&apos;t have a report yet.
        </p>
        {canEdit && (
          <form action={createWeek} className="mt-4">
            <input type="hidden" name="property" value={p} />
            <input type="hidden" name="week" value={w} />
            <Button type="submit">Create this week&apos;s report</Button>
          </form>
        )}
        <Link
          href={weeklyHref(p, w, "reports")}
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> All weeks
        </Link>
      </div>
    );
  }

  const { week } = data;
  const locked = week.locked;
  const readOnly = locked || !canEdit;
  const screenshots = await getWeeklyScreenshots(p, w);
  const ads = await getWeeklyAds(p, w);

  const sections: EditorSectionTab[] = [
    {
      key: "A", code: "A", label: "Overview", done: data.completion.A,
      node: <OverviewSection property={p} week={w} locked={readOnly} blocks={data.overview} />,
    },
    {
      key: "B", code: "B", label: "YTD Actual & Forecast", done: data.completion.B,
      node: <MonthlyGrid property={p} week={w} locked={readOnly} initial={data.monthly} />,
    },
    {
      key: "C", code: "C", label: "Market Segment", done: data.completion.C,
      node: (
        <ProductionGrid
          property={p} week={w} locked={readOnly}
          title="C · Weekly Market Segment"
          subtitle="Room nights and revenue by market segment. ARR and % share are calculated."
          labelHeader="Segment" addLabel="Add segment"
          initial={data.segments} action={saveSegments}
        />
      ),
    },
    {
      key: "D", code: "D", label: "Rate Code / Promotion", done: data.completion.D,
      node: (
        <ProductionGrid
          property={p} week={w} locked={readOnly}
          title="D · Rate Code / Promotion"
          subtitle="Production by rate code / promotion. ARR and % share are calculated."
          labelHeader="Rate Code / Promotion" addLabel="Add rate code"
          initial={data.rateCodes} action={saveRateCodes}
        />
      ),
    },
    {
      key: "EF", code: "E/F", label: "Channel Inside", done: data.completion.EF,
      node: (
        <ChannelsGrid
          property={p} week={w} locked={readOnly}
          defaultYear={week.year} years={data.channelYears} byYear={data.channelsByYear}
        />
      ),
    },
    {
      key: "G", code: "G", label: "Sales Activity", done: data.completion.G,
      node: (
        <ActivitiesCards
          property={p} week={w} locked={readOnly} sectionId="sales"
          title="G · Sales Activity" subtitle="Add each activity with its date and notes."
          subjectLabel="Subject" addLabel="Add activity" initial={data.sales}
        />
      ),
    },
    {
      key: "G2", code: "G2", label: "E-commerce", done: data.completion.G2,
      node: (
        <ActivitiesCards
          property={p} week={w} locked={readOnly} sectionId="ecommerce"
          title="G2 · E-commerce Activities" subtitle="Add each activity with its date and notes."
          subjectLabel="Task" addLabel="Add activity" initial={data.ecommerce}
        />
      ),
    },
    {
      key: "H", code: "H", label: "Social Media", done: data.completion.H,
      node: <SocialGrid property={p} week={w} locked={readOnly} initial={data.social} />,
    },
    {
      key: "I", code: "I", label: "Training", done: data.completion.I,
      node: <TrainingTable property={p} week={w} locked={readOnly} initial={data.trainings} />,
    },
    {
      key: "J", code: "J", label: "Action Plan", done: data.completion.J,
      node: <PlansCards property={p} week={w} locked={readOnly} initial={data.actionPlans} />,
    },
    {
      key: "OWNER", code: "★", label: "Owner Overview", done: data.completion.OWNER,
      node: (
        <OwnerOverview
          property={p} week={w} locked={readOnly}
          repeaters={data.ownerRepeaters} mix={data.ownerChannelMix}
        />
      ),
    },
    {
      key: "SM", code: "SM", label: "Screenshots", done: screenshots.length > 0,
      dividerAbove: true,
      node: (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="font-serif text-xl font-semibold text-foreground">SM · Screenshots & Summaries</h2>
          <p className="mb-4 mt-0.5 text-sm text-muted-foreground">
            Upload Booking.com / social screenshots and summarise each with AI.
          </p>
          <ScreenshotManager property={p} week={w} locked={readOnly} screenshots={screenshots} />
        </div>
      ),
    },
    {
      key: "ADS", code: "◧", label: "Digital Ads & ROAS", done: ads.hasData,
      node: (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <h2 className="font-serif text-xl font-semibold text-foreground">Digital Ads & ROAS</h2>
          <p className="mb-4 mt-0.5 text-sm text-muted-foreground">
            Sync from the ads dashboard, or enter Google / Meta figures manually.
          </p>
          <AdsEditor property={p} week={w} locked={readOnly} data={ads} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-serif text-3xl font-semibold text-foreground">
              {week.label}
            </h1>
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS_STYLES[week.status] ?? "bg-secondary text-secondary-foreground",
              )}
            >
              {statusLabel(week.status)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {week.propertyName} · Owner: {week.owner ?? "—"}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <Link href={weeklyHref(p, w, "reports")}>
            <Button variant="outline" size="sm">
              <ArrowLeft /> All weeks
            </Button>
          </Link>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {week.status === "DRAFT" && (
                <StatusForm property={p} week={w} target="IN_PROGRESS" label="Start — In Progress" />
              )}
              {week.status === "IN_PROGRESS" && (
                <>
                  <StatusForm property={p} week={w} target="READY_FOR_REVIEW" label="Submit for review" variant="default" />
                  <StatusForm property={p} week={w} target="DRAFT" label="Back to Draft" variant="outline" />
                </>
              )}
              {week.status === "READY_FOR_REVIEW" && (
                <>
                  {admin && (
                    <StatusForm property={p} week={w} target="APPROVED" label="Approve & lock" variant="default" />
                  )}
                  <StatusForm property={p} week={w} target="IN_PROGRESS" label="Back to In Progress" variant="outline" />
                </>
              )}
              {locked && admin && (
                <StatusForm property={p} week={w} target="DRAFT" label="Reopen to Draft" variant="outline" />
              )}
            </div>
          )}
        </div>
      </header>

      <WeeklyEditorShell sections={sections} />
    </div>
  );
}
