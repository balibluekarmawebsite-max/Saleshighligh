"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";

import { deleteWeek } from "@/lib/weekly/editor-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1 text-sm font-medium text-variance-negative transition-colors hover:underline disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      Delete
    </button>
  );
}

/** Delete-a-week control: confirms before firing the server action. */
export function DeleteWeekButton({
  property,
  week,
  label,
}: {
  property: string;
  week: string;
  label: string;
}) {
  return (
    <form
      action={deleteWeek}
      onSubmit={(e) => {
        if (!window.confirm(`Delete the "${label}" report? This permanently removes all its data and cannot be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="property" value={property} />
      <input type="hidden" name="week" value={week} />
      <Submit />
    </form>
  );
}
