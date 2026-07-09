"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
            <TriangleAlert className="h-5 w-5 text-variance-negative" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="font-medium text-foreground">Something went wrong</p>
            <p className="max-w-md text-sm text-muted-foreground">
              This section couldn&apos;t load. It may be a temporary database
              hiccup.
            </p>
          </div>
          <Button size="sm" onClick={reset}>
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
