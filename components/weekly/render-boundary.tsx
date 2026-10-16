"use client";

import { Component, type ReactNode } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

/**
 * A small client error boundary that isolates a slice of a page. If its children
 * throw while rendering, only this slice degrades to an inline notice (with the
 * actual error message, so it can be reported) and a retry — instead of the
 * whole section blanking and taking unsaved work in sibling fields with it.
 */
interface Props {
  /** A short name for the slice, shown in the fallback ("Booking Window"). */
  label?: string;
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class RenderBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    // Also log so it lands in the browser console with a component stack.
    console.error(`[weekly] render error${this.props.label ? ` in ${this.props.label}` : ""}:`, error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="rounded-md border border-dashed border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/5 p-3 text-sm">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <AlertTriangle className="h-4 w-4 text-[hsl(var(--brand-gold))]" aria-hidden />
          {this.props.label ? `"${this.props.label}" couldn't render` : "This part couldn't render"}
        </p>
        <p className="mt-1 text-muted-foreground">
          The rest of the page still works. {error.message ? (
            <>Details: <code className="rounded bg-secondary px-1 py-0.5 text-xs">{error.message}</code></>
          ) : null}
        </p>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Try again
        </button>
      </div>
    );
  }
}
