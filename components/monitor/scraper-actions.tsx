"use client";

import { useState, useTransition } from "react";

import { requestRescrapeAction, runCheckNowAction, type ActionResult } from "@/app/admin/scraper/actions";
import { cn } from "@/lib/utils";

function Message({ msg }: { msg: ActionResult | null }) {
  if (!msg) return null;
  return (
    <p className={cn("mt-2 text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.message}</p>
  );
}

/** Admin button: run the scraper-health check immediately. */
export function RunCheckButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => setMsg(await runCheckNowAction()));
        }}
        className="rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
      >
        {pending ? "Checking…" : "Run check now"}
      </button>
      <Message msg={msg} />
    </div>
  );
}

/**
 * Admin button: queue a daily re-pull. With `feed` it re-pulls only that feed
 * for the property; without it, the whole daily pull. `compact` is the in-cell
 * variant.
 */
export function RescrapeButton({
  property,
  feed = null,
  label,
  compact = false,
}: {
  property: string;
  feed?: string | null;
  label?: string;
  compact?: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);

  const text = label ?? (feed ? "Re-pull" : `Re-pull ${property}`);
  const cls = compact
    ? "rounded border border-brand-teal/60 px-1.5 py-0.5 text-[11px] font-medium text-brand-teal transition-colors hover:bg-brand-teal/10 disabled:opacity-50"
    : "rounded-md border border-brand-teal px-2.5 py-1 text-xs font-medium text-brand-teal transition-colors hover:bg-brand-teal/10 disabled:opacity-50";

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => setMsg(await requestRescrapeAction(property, feed)));
        }}
        className={cls}
      >
        {pending ? "Queuing…" : text}
      </button>
      <Message msg={msg} />
    </div>
  );
}
