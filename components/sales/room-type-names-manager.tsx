"use client";

import { useMemo, useState, useTransition } from "react";

import { removeRoomTypeNameAction, saveRoomTypeNameAction } from "@/app/admin/room-types/actions";
import type { RoomTypeNameOverview } from "@/lib/sales/room-type-name-rules";
import { cn } from "@/lib/utils";

type PropertyOption = { code: string; name: string };

const keyOf = (propertyCode: string, roomCode: string) => `${propertyCode}|${roomCode.toUpperCase()}`;

/** Admin UI: every VHP room code seen in the reports + its readable name, with
 * new-code flags. Names are scoped per property. */
export function RoomTypeNamesManager({
  overview,
  properties,
  canEdit,
}: {
  overview: RoomTypeNameOverview;
  properties: PropertyOption[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [propFilter, setPropFilter] = useState<string>("ALL");
  const [onlyNeeds, setOnlyNeeds] = useState(overview.needsName > 0);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Manual add form.
  const [addProp, setAddProp] = useState(properties[0]?.code ?? "BKDS");
  const [addCode, setAddCode] = useState("");
  const [addName, setAddName] = useState("");

  const rows = useMemo(() => {
    let r = overview.rows;
    if (propFilter !== "ALL") r = r.filter((x) => x.propertyCode === propFilter);
    if (onlyNeeds) r = r.filter((x) => x.needsName);
    const q = query.trim().toLowerCase();
    if (q) r = r.filter((x) => x.roomCode.toLowerCase().includes(q) || x.roomName.toLowerCase().includes(q));
    return r;
  }, [overview.rows, propFilter, onlyNeeds, query]);

  function run(p: Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    start(async () => {
      const res = await p;
      setMsg({ ok: res.ok, text: res.message });
    });
  }

  function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!addCode.trim() || !addName.trim()) return;
    start(async () => {
      const res = await saveRoomTypeNameAction(addProp, addCode, addName);
      setMsg({ ok: res.ok, text: res.message });
      if (res.ok) {
        setAddCode("");
        setAddName("");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* New-code notice */}
      {overview.needsName > 0 ? (
        <div className="rounded-lg border border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/10 p-4 text-sm text-foreground">
          <strong>{overview.needsName}</strong> room code{overview.needsName === 1 ? "" : "s"} appear in the reports with
          no name yet — they show as the raw code until you name them below.
        </div>
      ) : (
        <div className="rounded-lg border border-variance-positive/30 bg-variance-positive/10 p-4 text-sm text-variance-positive">
          Every room code in the reports has a name. New codes will appear here flagged for naming.
        </div>
      )}

      {/* Manual add */}
      {canEdit && (
        <form onSubmit={addRule} className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-4">
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Property</span>
            <select
              value={addProp}
              onChange={(e) => setAddProp(e.target.value)}
              className="rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground focus:border-brand-teal focus:outline-none"
            >
              {properties.map((p) => (
                <option key={p.code} value={p.code}>{p.code}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Room code</span>
            <input
              value={addCode}
              onChange={(e) => setAddCode(e.target.value)}
              placeholder="e.g. 1BPVL"
              className="w-32 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm uppercase text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
            />
          </label>
          <label className="flex-1 min-w-[200px] text-sm">
            <span className="mb-1 block text-xs font-medium text-muted-foreground">Room name</span>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="e.g. 1 Bedroom Pool Villa"
              className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
            />
          </label>
          <button
            type="submit"
            disabled={pending || !addCode.trim() || !addName.trim()}
            className="rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Add name"}
          </button>
        </form>
      )}

      {msg && <p className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</p>}

      {/* Filters + search */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {[{ code: "ALL", name: "All" }, ...properties].map((p) => (
            <button
              key={p.code}
              type="button"
              onClick={() => setPropFilter(p.code)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                propFilter === p.code
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {p.code === "ALL" ? "All properties" : p.code}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOnlyNeeds((v) => !v)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              onlyNeeds
                ? "border-[hsl(var(--brand-gold))] bg-[hsl(var(--brand-gold))]/15 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Needs name ({overview.needsName})
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search code or name…"
          className="w-48 rounded-md border border-border bg-card px-2.5 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2 text-left">Property</th>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Room name</th>
              <th className="px-3 py-2 text-left">Status</th>
              {canEdit && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const key = keyOf(r.propertyCode, r.roomCode);
              const sel = draft[key] ?? r.roomName;
              const dirty = sel !== r.roomName;
              const canSave = canEdit && sel.trim().length > 0 && (dirty || !r.hasRule);
              return (
                <tr key={key} className={cn("border-b border-border/60", r.needsName && "bg-[hsl(var(--brand-gold))]/5")}>
                  <td className="px-3 py-2 text-muted-foreground">{r.propertyCode}</td>
                  <td className="px-3 py-2 font-mono text-xs text-foreground">{r.roomCode}</td>
                  <td className="px-3 py-2">
                    {canEdit ? (
                      <input
                        value={sel}
                        disabled={pending}
                        placeholder="Type a room name…"
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        className="w-full min-w-[180px] rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none disabled:opacity-50"
                      />
                    ) : (
                      <span className="text-foreground">{r.roomName || <span className="text-muted-foreground">{r.roomCode}</span>}</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {r.hasRule ? (
                      <span className="text-xs text-variance-positive">Named</span>
                    ) : r.needsName ? (
                      <span className="text-xs font-medium text-[hsl(var(--brand-gold))]">Needs name</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {!r.inData && <span className="ml-1 text-[10px] text-muted-foreground">(not in data)</span>}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2 text-right">
                      <div className="inline-flex items-center gap-3">
                        {canSave && (
                          <button
                            type="button"
                            onClick={() => run(saveRoomTypeNameAction(r.propertyCode, r.roomCode, sel))}
                            disabled={pending}
                            className="text-xs font-medium text-brand-teal hover:underline disabled:opacity-50"
                          >
                            Save
                          </button>
                        )}
                        {r.hasRule && r.ruleId && (
                          <button
                            type="button"
                            onClick={() => run(removeRoomTypeNameAction(r.ruleId!))}
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
                <td colSpan={canEdit ? 5 : 4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No room codes match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
