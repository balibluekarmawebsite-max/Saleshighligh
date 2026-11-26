"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addInfluencerCollab,
  deleteInfluencerCollab,
  updateInfluencerCollab,
} from "@/app/dashboard/[property]/[period]/social/influencer-actions";
import type { InfluencerRow } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type Msg = { ok: boolean; text: string } | null;

const INPUT =
  "rounded-md border border-border bg-card px-2 py-1 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none";

/** One existing collaboration: image + editable details + delete. */
function EntryCard({ entry }: { entry: InfluencerRow }) {
  const router = useRouter();
  const [name, setName] = useState(entry.name);
  const [handle, setHandle] = useState(entry.handle);
  const [followers, setFollowers] = useState(String(entry.followers));
  const [origin, setOrigin] = useState(entry.origin === "—" ? "" : entry.origin);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const r = await updateInfluencerCollab({ id: entry.id, name, handle, followers, origin, notes });
      setMsg({ ok: r.ok, text: r.ok ? "Saved." : r.message ?? "Save failed." });
      if (r.ok) router.refresh();
    });
  }
  function remove() {
    if (!confirm(`Remove ${entry.handle} from this month?`)) return;
    setMsg(null);
    start(async () => {
      const r = await deleteInfluencerCollab(entry.id);
      if (r.ok) router.refresh();
      else setMsg({ ok: false, text: r.message ?? "Delete failed." });
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-3 sm:grid-cols-[180px_1fr]">
      <div className="overflow-hidden rounded-md border border-border bg-secondary/20">
        {entry.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={entry.imageUrl} alt={entry.name} className="h-full max-h-56 w-full object-contain" />
        ) : (
          <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No image</div>
        )}
      </div>
      <div className="space-y-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Angga Darma" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Handle
            <input value={handle} onChange={(e) => setHandle(e.target.value)} className={INPUT} placeholder="@anggadarmaa" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Followers
            <input value={followers} onChange={(e) => setFollowers(e.target.value)} className={INPUT} placeholder="10.6K" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Origin
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} className={INPUT} placeholder="Indonesia" />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Summary / explanation
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(INPUT, "resize-y")} placeholder="Short note about this collaboration…" />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={save} disabled={busy}
            className="rounded-md bg-brand-gold px-3 py-1 text-xs font-medium text-brand-teal hover:bg-brand-gold/90 disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" onClick={remove} disabled={busy}
            className="rounded-md border border-variance-negative/40 px-3 py-1 text-xs font-medium text-variance-negative hover:bg-variance-negative/5 disabled:opacity-50">
            Delete
          </button>
          {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
        </div>
      </div>
    </div>
  );
}

/** The "add a collaboration" form: details + screenshot. */
function AddForm({ property, period }: { property: string; period: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [followers, setFollowers] = useState("");
  const [origin, setOrigin] = useState("");
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    setPreview(f ? URL.createObjectURL(f) : null);
  }
  function reset() {
    setName(""); setHandle(""); setFollowers(""); setOrigin(""); setNotes(""); setPreview(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  function submit() {
    setMsg(null);
    const fd = new FormData();
    fd.set("property", property);
    fd.set("period", period);
    fd.set("name", name);
    fd.set("handle", handle);
    fd.set("followers", followers);
    fd.set("origin", origin);
    fd.set("notes", notes);
    const f = fileRef.current?.files?.[0];
    if (f) fd.set("file", f);
    start(async () => {
      const r = await addInfluencerCollab(fd);
      if (r.ok) {
        setMsg({ ok: true, text: "Added." });
        reset();
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.message ?? "Could not add." });
      }
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border border-dashed border-border bg-secondary/10 p-3 sm:grid-cols-[180px_1fr]">
      <div className="space-y-2">
        <div className="flex h-40 items-center justify-center overflow-hidden rounded-md border border-border bg-card">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="preview" className="h-full w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-xs text-muted-foreground">Screenshot preview</span>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onFile}
          className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border-0 file:bg-brand-teal/10 file:px-2 file:py-1 file:text-xs file:text-brand-teal" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Add a collaboration</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} className={INPUT} placeholder="Name (e.g. Angga Darma)" />
          <input value={handle} onChange={(e) => setHandle(e.target.value)} className={INPUT} placeholder="@handle" />
          <input value={followers} onChange={(e) => setFollowers(e.target.value)} className={INPUT} placeholder="Followers (e.g. 10.6K)" />
          <input value={origin} onChange={(e) => setOrigin(e.target.value)} className={INPUT} placeholder="Origin (e.g. Indonesia)" />
        </div>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={cn(INPUT, "resize-y")} placeholder="Short summary / explanation…" />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={submit} disabled={busy}
            className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal hover:bg-brand-teal/10 disabled:opacity-50">
            {busy ? "Adding…" : "Add collaboration"}
          </button>
          {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
        </div>
      </div>
    </div>
  );
}

/** Editor panel: manage the month's influencer collaborations (image + details). */
export function InfluencerUploader({
  property,
  period,
  entries,
}: {
  property: string;
  period: string;
  entries: InfluencerRow[];
}) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10">
        {entries.length ? "Manage collaborations" : "Add collaborations"}
      </button>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Influencer collaborations — {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Upload each collaboration&rsquo;s screenshot and a short summary. Add as many as you like — they appear below as cards.
      </p>
      {entries.map((e) => (
        <EntryCard key={e.id} entry={e} />
      ))}
      <AddForm property={property} period={period} />
    </div>
  );
}
