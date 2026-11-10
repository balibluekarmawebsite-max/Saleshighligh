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

/** Admin button: queue a daily re-pull for one property. */
export function RescrapeButton({ property }: { property: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<ActionResult | null>(null);

  return (
    <div className="inline-flex flex-col">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => setMsg(await requestRescrapeAction(property)));
        }}
        className="rounded-md border border-brand-teal px-2.5 py-1 text-xs font-medium text-brand-teal transition-colors hover:bg-brand-teal/10 disabled:opacity-50"
      >
        {pending ? "Queuing…" : `Re-pull ${property}`}
      </button>
      <Message msg={msg} />
    </div>
  );
}
