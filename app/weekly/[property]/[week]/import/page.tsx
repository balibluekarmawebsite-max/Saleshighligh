import { AlertCircle, Lock } from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { Button } from "@/components/ui/button";
import { ImportClient } from "@/components/weekly/import-client";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { createWeek } from "@/lib/weekly/editor-actions";
import { getWeeklyEditorData } from "@/lib/weekly/editor-data";
import { weekLabel } from "@/lib/weekly/week";

export const dynamic = "force-dynamic";

export default async function WeeklyImportPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const data = await getWeeklyEditorData(params.property, params.week);
  const user = await getCurrentUser();
  const canEdit = canEditProperty(user, params.property);

  if (!data.week) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
        <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">
          No report for this week
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {weekLabel(params.week)} doesn&apos;t have a report yet — create it first.
        </p>
        {canEdit && (
          <form action={createWeek} className="mt-4">
            <input type="hidden" name="property" value={params.property} />
            <input type="hidden" name="week" value={params.week} />
            <Button type="submit">Create this week&apos;s report</Button>
          </form>
        )}
      </div>
    );
  }

  const locked = data.week.locked || !canEdit;

  return (
    <div className="space-y-4">
      {locked && (
        <p className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden />
          {data.week.locked
            ? "This report is approved and locked — reopen it to import."
            : "You have read-only access to this property."}
        </p>
      )}
      <SectionCard
        title="Import weekly data"
        description="Upload a CSV or Excel file for one section at a time, preview it, then apply"
      >
        <ImportClient property={params.property} week={params.week} locked={locked} />
      </SectionCard>
    </div>
  );
}
