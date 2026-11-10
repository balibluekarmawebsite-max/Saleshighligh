"use client";

import { useState, useTransition } from "react";

import { sendTestDailyReport } from "@/app/admin/daily-email/actions";
import { cn } from "@/lib/utils";

type TestSendResult = { ok: boolean; message: string };

/**
 * Admin button that sends the Daily Report email now (real send to the
 * configured recipients) and shows the outcome. Confirms first so it isn't
 * triggered by accident.
 */
export function TestSendButton({ recipients }: { recipients: string[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TestSendResult | null>(null);

  function run() {
    const who = recipients.length ? recipients.join(", ") : "the configured recipients";
    if (!window.confirm(`Send a real Daily Report email now to ${who}?`)) return;
    setResult(null);
    startTransition(async () => setResult(await sendTestDailyReport()));
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center rounded-md bg-brand-teal px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send a test email now"}
      </button>
      {result ? (
        <p className={cn("text-sm", result.ok ? "text-variance-positive" : "text-variance-negative")}>
          {result.ok ? "✓ " : "✗ "}
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
