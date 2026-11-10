"use client";

import { useState, useTransition } from "react";

import { addRecipientAction, removeRecipientAction } from "@/app/admin/daily-email/actions";
import { cn } from "@/lib/utils";

type Row = { id: string; email: string; source: "db" | "env" };

/**
 * Manage the Daily Report email recipients. DB entries can be added/removed;
 * entries from DAILY_REPORT_TO (.env) are shown read-only.
 */
export function RecipientsManager({ recipients, canEdit }: { recipients: Row[]; canEdit: boolean }) {
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function add(e: React.FormEvent) {
    e.preventDefault();
    const v = email.trim();
    if (!v) return;
    setMsg(null);
    startTransition(async () => {
      const r = await addRecipientAction(v);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setEmail("");
    });
  }

  function remove(id: string) {
    setMsg(null);
    startTransition(async () => {
      const r = await removeRecipientAction(id);
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  return (
    <div className="space-y-3">
      {recipients.length === 0 ? (
        <p className="text-sm text-variance-negative">No recipients — the daily email can&apos;t send.</p>
      ) : (
        <ul className="space-y-1">
          {recipients.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-foreground">
                {r.email}
                {r.source === "env" ? <span className="ml-2 text-xs text-muted-foreground">(from .env)</span> : null}
              </span>
              {canEdit && r.source === "db" ? (
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  disabled={pending}
                  className="text-xs font-medium text-variance-negative hover:underline disabled:opacity-50"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form onSubmit={add} className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="flex-1 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending || !email.trim()}
            className="shrink-0 rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
          >
            {pending ? "…" : "Add"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">Only admins can add or remove recipients.</p>
      )}

      {msg ? (
        <p className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</p>
      ) : null}
    </div>
  );
}
