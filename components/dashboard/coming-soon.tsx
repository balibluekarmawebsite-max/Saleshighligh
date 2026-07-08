import { Card, CardContent } from "@/components/ui/card";

/** Placeholder for sections not yet built, so the nav is fully navigable. */
export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {description ?? "This section is coming in a later phase."}
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 p-16 text-center">
          <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            Coming soon
          </span>
          <p className="max-w-md text-sm text-muted-foreground">
            The data model for this section already exists. The dashboard view is
            on the roadmap — see <code className="text-foreground">CLAUDE.md</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
