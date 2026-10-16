"use client";

import { useFormState } from "react-dom";
import { Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiTextActions } from "@/components/weekly/ai-text-actions";
import { saveActionPlanCategory } from "@/lib/weekly/editor-actions";
import { ACTION_PLAN_CATEGORIES } from "@/lib/weekly/editor-data";
import {
  CELL,
  SaveButton,
  SectionCardShell,
  SectionHeading,
  useRows,
  type Row,
} from "@/components/weekly/sections/shared";

/** A blank plan row (stable content → safe to pass through useRows). */
const blankPlan = (): Row => ({ plan: "", remark: "", startLabel: "", deadlineLabel: "" });

interface CategoryCardModel {
  /** Stored category value ("" → uncategorized/null). */
  category: string;
  label: string;
  rows: Row[];
}

/** Split the flat action-plan rows into one bucket per category. */
function buildCategoryCards(initial: Row[]): CategoryCardModel[] {
  const byCat = new Map<string, Row[]>();
  for (const r of initial) {
    const key = (r.category ?? "").trim();
    const bucket = byCat.get(key) ?? [];
    bucket.push(r);
    byCat.set(key, bucket);
  }

  const cards: CategoryCardModel[] = [];
  // The fixed categories always render (each its own section), in report order.
  for (const c of ACTION_PLAN_CATEGORIES) {
    cards.push({ category: c, label: c, rows: byCat.get(c) ?? [] });
    byCat.delete(c);
  }
  // Any leftover legacy/unknown categories still show so existing plans aren't
  // hidden or lost — each keeps its own independent save.
  for (const [key, rows] of byCat) {
    if (key === "") continue;
    cards.push({ category: key, label: key, rows });
  }
  const uncategorized = byCat.get("");
  if (uncategorized && uncategorized.length > 0) {
    cards.push({ category: "", label: "Uncategorized", rows: uncategorized });
  }
  return cards;
}

/** One independently-saved category block (its own form → no cross-category overwrite). */
function CategoryCard({
  property,
  week,
  locked,
  category,
  label,
  initial,
}: {
  property: string;
  week: string;
  locked: boolean;
  category: string;
  label: string;
  initial: Row[];
}) {
  // Seed one blank plan when the category is empty, so there's a textbox ready.
  const { rows, update, add, remove } = useRows(initial.length ? initial : [blankPlan()]);
  const [state, formAction] = useFormState(saveActionPlanCategory, null);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border p-4">
      <input type="hidden" name="property" value={property} />
      <input type="hidden" name="week" value={week} />
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="rows" value={JSON.stringify(rows)} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        {!locked && <SaveButton state={state} />}
      </div>

      {rows.map((row, i) => (
        <div
          key={i}
          className="relative space-y-3 rounded-md border border-border/60 bg-muted/10 p-3"
        >
          {!locked && rows.length > 1 && (
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute right-2 top-2 text-muted-foreground transition-colors hover:text-variance-negative"
              aria-label="Remove plan"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <div className="pr-6">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Plan
            </label>
            <textarea
              value={row.plan ?? ""}
              onChange={(e) => update(i, "plan", e.target.value)}
              disabled={locked}
              rows={3}
              className={`${CELL} resize-y`}
              placeholder="Describe the plan…"
            />
            {!locked && (
              <AiTextActions
                value={row.plan ?? ""}
                onResult={(t) => update(i, "plan", t)}
                actions={["rewrite", "en", "id"]}
                className="mt-1.5"
              />
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Subject
              </label>
              <input
                value={row.remark ?? ""}
                onChange={(e) => update(i, "remark", e.target.value)}
                disabled={locked}
                className={CELL}
                placeholder="e.g. Meeting"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Start
              </label>
              <input
                value={row.startLabel ?? ""}
                onChange={(e) => update(i, "startLabel", e.target.value)}
                disabled={locked}
                className={CELL}
                placeholder="e.g. 02 Oct"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Deadline
              </label>
              <input
                value={row.deadlineLabel ?? ""}
                onChange={(e) => update(i, "deadlineLabel", e.target.value)}
                disabled={locked}
                className={CELL}
                placeholder="e.g. 08 Oct"
              />
            </div>
          </div>
        </div>
      ))}

      {!locked && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-primary"
          onClick={() => add(blankPlan())}
        >
          <Plus /> Add another plan
        </Button>
      )}
    </form>
  );
}

/**
 * Section J — Next Week Action Plan. One independently-saved section per
 * category (Offline Agent, Room Promotion, …, OTA), so different owners can
 * fill in their own category without overwriting anyone else's.
 */
export function PlansCards({
  property,
  week,
  locked,
  initial,
}: {
  property: string;
  week: string;
  locked: boolean;
  initial: Row[];
}) {
  const cards = buildCategoryCards(initial);

  return (
    <SectionCardShell>
      <div className="mb-4">
        <SectionHeading
          title="J · Next Week Action Plan"
          subtitle="One section per category — each is saved on its own, so different owners can edit their category without overwriting each other."
        />
      </div>

      <div className="space-y-5">
        {cards.map((c) => (
          <CategoryCard
            key={c.category || "__uncategorized__"}
            property={property}
            week={week}
            locked={locked}
            category={c.category}
            label={c.label}
            initial={c.rows}
          />
        ))}
      </div>
    </SectionCardShell>
  );
}
