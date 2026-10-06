import { type LucideIcon } from "lucide-react";

/**
 * A titled placeholder for Weekly Reports sections whose UI arrives in a later
 * phase. Keeps the navigation fully walkable while the feature is built out.
 */
export function SectionPlaceholder({
  icon: Icon,
  title,
  description,
  phase,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
        <Icon className="h-6 w-6 text-accent-foreground" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <span className="mt-4 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
        {phase}
      </span>
    </div>
  );
}
