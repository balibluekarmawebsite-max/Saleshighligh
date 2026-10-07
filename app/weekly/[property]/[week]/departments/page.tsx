import { AlertCircle, Lock } from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { Button } from "@/components/ui/button";
import { SectionEditor } from "@/components/weekly/section-editor";
import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { createWeek } from "@/lib/weekly/editor-actions";
import { getWeeklyDepartmentData } from "@/lib/weekly/editor-data";
import { SECTION_SPECS } from "@/lib/weekly/sections";
import { weekLabel } from "@/lib/weekly/week";

export const dynamic = "force-dynamic";

export default async function WeeklyDepartmentsPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const data = await getWeeklyDepartmentData(params.property, params.week);
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
          {weekLabel(params.week)} doesn&apos;t have a report yet.
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

  const readOnly = data.week.locked || !canEdit;

  return (
    <div className="space-y-6">
      {readOnly && (
        <p className="flex items-center gap-2 rounded-md bg-secondary px-3 py-2 text-sm text-muted-foreground">
          <Lock className="h-4 w-4" aria-hidden />
          {data.week.locked
            ? "This report is approved and locked — inputs are read-only."
            : "You have read-only access to this property."}
        </p>
      )}

      {SECTION_SPECS.map((spec) => (
        <SectionCard key={spec.id} title={spec.title} description={spec.description}>
          <SectionEditor
            property={params.property}
            week={params.week}
            sectionId={spec.id}
            fields={spec.fields}
            initialRows={data.rows[spec.id] ?? []}
            locked={readOnly}
          />
        </SectionCard>
      ))}
    </div>
  );
}
