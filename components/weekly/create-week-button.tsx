"use client";

import { type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Submit button for the `createWeek` form. Creating a report now also pulls the
 * week's ads + social so the report opens pre-populated, which takes a moment —
 * so this shows a pending spinner (via useFormStatus) instead of sitting dead.
 * Must be rendered inside the `<form action={createWeek}>`.
 */
export function CreateWeekButton({
  children,
  variant,
  size,
}: {
  children: ReactNode;
  variant?: "default" | "secondary" | "outline";
  size?: "default" | "sm";
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className="gap-1.5">
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Creating &amp; syncing…
        </>
      ) : (
        children
      )}
    </Button>
  );
}
