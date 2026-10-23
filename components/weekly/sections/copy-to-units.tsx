"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export interface CopyTarget {
  code: string;
  name: string;
}

/**
 * "Same for other units?" control — placed inside an editor section's form, so
 * clicking Copy submits the SAME current rows (the form's hidden `rows` input)
 * to `saveSection` with `intent=copy` and the checked target units. The server
 * saves this unit and replicates the section into each selected sibling
 * property's report for the same week. Overwrites the target section, so it
 * asks for confirmation first.
 */
export function CopyToUnits({
  targets,
  sectionLabel,
  locked,
}: {
  targets: CopyTarget[];
  sectionLabel: string;
  locked: boolean;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { pending } = useFormStatus();

  if (locked || targets.length === 0) return null;

  const toggle = (code: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/20 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Same for other units? Save &amp; copy this section to:
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {targets.map((t) => (
          <label key={t.code} className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="checkbox"
              name="targets"
              value={t.code}
              checked={picked.has(t.code)}
              onChange={() => toggle(t.code)}
              className="h-4 w-4 rounded border-border accent-[hsl(var(--primary))]"
            />
            <span className="font-medium">{t.code}</span>
            <span className="text-muted-foreground">· {t.name}</span>
          </label>
        ))}
        <Button
          type="submit"
          name="intent"
          value="copy"
          variant="outline"
          size="sm"
          disabled={pending || picked.size === 0}
          onClick={(e) => {
            if (picked.size === 0) {
              e.preventDefault();
              return;
            }
            const codes = [...picked].join(", ");
            if (
              !window.confirm(
                `Copy this ${sectionLabel} to ${codes}? This replaces their current ${sectionLabel} for this week.`,
              )
            ) {
              e.preventDefault();
            }
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Copy />} Copy to selected
        </Button>
      </div>
    </div>
  );
}
