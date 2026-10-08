import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiImportClient } from "@/components/weekly/ai-import-client";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { createWeek } from "@/lib/weekly/editor-actions";
import { getWeeklyFullEditorData } from "@/lib/weekly/editor-data";
import { isGroqConfigured } from "@/lib/weekly/import/ai";
import { weekLabel } from "@/lib/weekly/week";

export const dynamic = "force-dynamic";

export default async function WeeklyImportPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const data = await getWeeklyFullEditorData(params.property, params.week);
  const user = await getCurrentUser();
  const canEdit = canEditProperty(user, params.property);

  if (!data.week) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
        <AlertCircle className="mb-3 h-8 w-8 text-muted-foreground" aria-hidden />
        <h2 className="text-lg font-semibold text-foreground">No report for this week</h2>
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
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Data Import</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Import each report section from its own source — CSV, Excel or a screenshot.
        </p>
      </div>
      <AiImportClient
        property={params.property}
        week={params.week}
        weekLabel={data.week.label}
        locked={locked}
        aiConfigured={isGroqConfigured()}
        defaultYear={data.week.year}
        completion={data.completion}
      />
    </div>
  );
}
