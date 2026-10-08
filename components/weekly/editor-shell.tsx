"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface EditorSectionTab {
  key: string;
  /** Short code shown in the square badge (A, B, E/F, ★, …). */
  code: string;
  label: string;
  done: boolean;
  node: ReactNode;
  /** Optional divider above this item (separates the core report from extras). */
  dividerAbove?: boolean;
}

/** The report editor's SECTIONS nav + the active section's editor. */
export function WeeklyEditorShell({ sections }: { sections: EditorSectionTab[] }) {
  const [active, setActive] = useState<string>(sections[0]?.key ?? "");
  const current = sections.find((s) => s.key === active) ?? sections[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[232px_1fr]">
      <nav className="lg:sticky lg:top-0 lg:self-start">
        <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
          <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Sections
          </p>
          <ul className="space-y-0.5">
            {sections.map((s) => {
              const isActive = s.key === current?.key;
              return (
                <li key={s.key}>
                  {s.dividerAbove && <div className="my-1.5 border-t border-border" />}
                  <button
                    type="button"
                    onClick={() => setActive(s.key)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-foreground hover:bg-accent/60",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-6 w-7 shrink-0 items-center justify-center rounded text-[11px] font-semibold",
                        isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      {s.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{s.label}</span>
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        s.done
                          ? "bg-variance-positive"
                          : isActive
                            ? "bg-primary-foreground/40"
                            : "bg-muted-foreground/25",
                      )}
                      aria-label={s.done ? "Complete" : "Empty"}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div key={current?.key} className="min-w-0">{current?.node}</div>
    </div>
  );
}
