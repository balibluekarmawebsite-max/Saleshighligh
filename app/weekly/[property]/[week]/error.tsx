"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Error boundary for the Weekly Reports section. Without it, a client-side
 * exception blanks the whole page with the generic Next.js message; here it
 * degrades to a recoverable panel (and keeps the shell), with a retry that
 * re-renders the segment and a full reload (which also picks up a fresh client
 * bundle after a deploy, the usual cause of a one-off client exception).
 */
export default function WeeklyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it in the browser console for diagnosis.
    console.error("Weekly section error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-[hsl(var(--brand-gold))]" aria-hidden />
      <h2 className="text-lg font-semibold text-foreground">Something went wrong on this page</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This section hit an error while rendering. Try again, or reload the page — a reload also
        refreshes the app after a recent update, which fixes most one-off errors.
      </p>
      {error.message && (
        <p className="mt-2 max-w-md text-xs text-muted-foreground">
          Details: <code className="rounded bg-secondary px-1 py-0.5 break-words">{error.message}</code>
        </p>
      )}
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground">
          Reference: <code className="rounded bg-secondary px-1 py-0.5">{error.digest}</code>
        </p>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="sm" onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") window.location.reload();
          }}
        >
          Reload page
        </Button>
      </div>
    </div>
  );
}
