"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { syncMonthlyAdsAction } from "@/app/dashboard/[property]/[period]/marketing/actions";
import { cn } from "@/lib/utils";

/** Pulls this month's Digital Ads & ROAS from the ads dashboard API (same source
 * as the weekly report). Shown to editors/admins. */
export function AdsSyncButton({
  property,
  period,
  variant = "primary",
}: {
  property: string;
  period: string;
  variant?: "primary" | "link";
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await syncMonthlyAdsAction({ property, period });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={cn(
          "rounded-md text-sm font-medium transition-colors disabled:opacity-50",
          variant === "primary"
            ? "border border-brand-teal px-3 py-1.5 text-brand-teal hover:bg-brand-teal/10"
            : "text-brand-teal hover:underline",
        )}
      >
        {busy ? "Syncing…" : "Sync ads from dashboard"}
      </button>
      {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
    </div>
  );
}
