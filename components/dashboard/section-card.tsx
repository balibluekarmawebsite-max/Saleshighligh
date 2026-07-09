import { Sparkles } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/** Titled card wrapper with an optional actions slot and "AI Insight" footer. */
export function SectionCard({
  title,
  description,
  actions,
  insight,
  children,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  insight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="space-y-6">{children}</CardContent>
      {insight && (
        <div className="mx-6 mb-6 flex gap-2 rounded-md border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/5 p-3 text-sm">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--brand-gold))]" aria-hidden />
          <div className="text-muted-foreground">
            <span className="font-medium text-foreground">AI Insight · </span>
            {insight}
          </div>
        </div>
      )}
    </Card>
  );
}
