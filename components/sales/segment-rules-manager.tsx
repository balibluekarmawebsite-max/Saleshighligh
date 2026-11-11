"use client";

import { useMemo, useState, useTransition } from "react";

import { removeSegmentRuleAction, saveSegmentRuleAction } from "@/app/admin/account-segments/actions";
import { SEGMENT_OPTIONS, segmentLabel } from "@/lib/sales/account-segments";
import { cn } from "@/lib/utils";

interface Rule {
  id: string;
  accountName: string;
  segment: string;
}

/** Admin UI to manage the saved account→segment rules (reused across properties). */
export function SegmentRulesManager({ rules, canEdit }: { rules: Rule[]; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [segment, setSegment] = useState(SEGMENT_OPTIONS[0]!.code);
  const [query, setQuery] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rules.filter((r) => r.accountName.toLowerCase().includes(q)) : rules;
  }, [rules, query]);

  function save(e: React.FormEvent) {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    setMsg(null);
    start(async () => {
      const r = await saveSegmentRuleAction(v, segment);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setName("");
    });
  }

  function reassign(id: string, accountName: string, seg: string) {
    setMsg(null);
    start(async () => {
      const r = await saveSegmentRuleAction(accountName, seg);
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  function remove(id: string) {
    setMsg(null);
    start(async () => {
      const r = await removeSegmentRuleAction(id);
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  return (
    <div className="space-y-5">
      {canEdit && (
        <form onSubmit={save} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
          <label className="flex-1 min-w-[200px] text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Account name (as VHP shows it)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Luxury Escapes"
              className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Segment</span>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value)}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:border-brand-teal focus:outline-none"
            >
              {SEGMENT_OPTIONS.map((o) => (
                <option key={o.code} value={o.code}>{o.label}</option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save rule"}
          </button>
        </form>
      )}

      {msg && <p className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</p>}

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{rules.length} saved rule{rules.length === 1 ? "" : "s"} · applied to every property</p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts…"
            className="w-48 rounded-md border border-border bg-card px-2.5 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
          />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Segment</th>
                {canEdit && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-border/60">
                  <td className="px-3 py-2 text-foreground">{r.accountName}</td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select
                        defaultValue={r.segment}
                        disabled={pending}
                        onChange={(e) => reassign(r.id, r.accountName, e.target.value)}
                        className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:border-brand-teal focus:outline-none disabled:opacity-50"
                      >
                        {SEGMENT_OPTIONS.map((o) => (
                          <option key={o.code} value={o.code}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-muted-foreground">{segmentLabel(r.segment)}</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        disabled={pending}
                        className="text-xs font-medium text-variance-negative hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 3 : 2} className="px-3 py-6 text-center text-sm text-muted-foreground">
                    {rules.length === 0 ? "No rules yet — add one above." : "No accounts match your search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
