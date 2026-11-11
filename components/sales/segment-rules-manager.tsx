"use client";

import { useMemo, useState, useTransition } from "react";

import {
  assignAllAutoAction,
  removeSegmentRuleAction,
  saveSegmentRuleAction,
} from "@/app/admin/account-segments/actions";
import type { AccountSegmentOverview } from "@/lib/sales/account-segment-rules";
import { SEGMENT_OPTIONS, segmentLabel } from "@/lib/sales/account-segments";
import { cn } from "@/lib/utils";

type FilterKey = "all" | "review" | "norule" | "rule";

/** Admin UI: every account seen in the reports + its segment, with new-agent flags. */
export function SegmentRulesManager({ overview, canEdit }: { overview: AccountSegmentOverview; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [addSeg, setAddSeg] = useState(SEGMENT_OPTIONS[0]!.code);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>(overview.needsReview > 0 ? "review" : "all");
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = useMemo(() => {
    let r = overview.rows;
    if (filter === "review") r = r.filter((x) => x.needsReview);
    else if (filter === "norule") r = r.filter((x) => !x.hasRule);
    else if (filter === "rule") r = r.filter((x) => x.hasRule);
    const q = query.trim().toLowerCase();
    if (q) r = r.filter((x) => x.accountName.toLowerCase().includes(q));
    return r;
  }, [overview.rows, filter, query]);

  function run(p: Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    start(async () => {
      const r = await p;
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  function addRule(e: React.FormEvent) {
    e.preventDefault();
    const v = name.trim();
    if (!v) return;
    start(async () => {
      const r = await saveSegmentRuleAction(v, addSeg);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setName("");
    });
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all", label: `All (${overview.total})` },
    { key: "review", label: `Needs review (${overview.needsReview})` },
    { key: "norule", label: `No rule (${overview.noRule})` },
    { key: "rule", label: `Assigned (${overview.total - overview.noRule})` },
  ];

  return (
    <div className="space-y-5">
      {/* New-agent notice */}
      {overview.needsReview > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/10 p-4">
          <p className="text-sm text-foreground">
            <strong>{overview.needsReview}</strong> account{overview.needsReview === 1 ? "" : "s"} need a segment decision
            {overview.noRule > overview.needsReview ? ` (${overview.noRule} have no saved rule in total)` : ""}.
          </p>
          {canEdit && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(assignAllAutoAction())}
              className="rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
            >
              {pending ? "Assigning…" : `Assign all ${overview.noRule} to current segment`}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-variance-positive/30 bg-variance-positive/10 p-4 text-sm text-variance-positive">
          All accounts have a saved segment. New agents will appear here flagged for review.
        </div>
      )}

      {/* Manual add */}
      {canEdit && (
        <form onSubmit={addRule} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
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
              value={addSeg}
              onChange={(e) => setAddSeg(e.target.value)}
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
            {pending ? "Saving…" : "Add rule"}
          </button>
        </form>
      )}

      {msg && <p className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</p>}

      {/* Filters + search */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search accounts…"
          className="w-48 rounded-md border border-border bg-card px-2.5 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Segment</th>
              <th className="px-3 py-2 text-left">Status</th>
              {canEdit && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = r.accountName.toLowerCase();
              const sel = choice[key] ?? r.segment;
              const dirty = sel !== r.segment;
              return (
                <tr key={key} className={cn("border-b border-border/60", r.needsReview && "bg-[hsl(var(--brand-gold))]/5")}>
                  <td className="px-3 py-2 text-foreground">{r.accountName}</td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <select
                        value={sel}
                        disabled={pending}
                        onChange={(e) => setChoice((c) => ({ ...c, [key]: e.target.value }))}
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
                  <td className="px-3 py-2">
                    {r.hasRule ? (
                      <span className="text-xs text-variance-positive">Assigned</span>
                    ) : r.needsReview ? (
                      <span className="text-xs font-medium text-[hsl(var(--brand-gold))]">Needs review</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Auto</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-3">
                        {(dirty || !r.hasRule) && (
                          <button
                            type="button"
                            onClick={() => run(saveSegmentRuleAction(r.accountName, sel))}
                            disabled={pending}
                            className="text-xs font-medium text-brand-teal hover:underline disabled:opacity-50"
                          >
                            Save
                          </button>
                        )}
                        {r.hasRule && r.ruleId && (
                          <button
                            type="button"
                            onClick={() => run(removeSegmentRuleAction(r.ruleId!))}
                            disabled={pending}
                            className="text-xs font-medium text-variance-negative hover:underline disabled:opacity-50"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 4 : 3} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No accounts match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
