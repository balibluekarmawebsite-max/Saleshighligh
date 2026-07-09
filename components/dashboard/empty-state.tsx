import Link from "next/link";
import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/** Friendly prompt shown when a period (or section) has no data yet. */
export function EmptyState({
  title = "No data yet",
  message,
  actionHref,
  actionLabel,
}: {
  title?: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary">
          <Inbox className="h-5 w-5 text-muted-foreground" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-medium text-foreground">{title}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{message}</p>
        </div>
        {actionHref && actionLabel && (
          <Button asChild size="sm">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
