"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  extractRestaurantTripadvisorAction,
  saveRestaurantTripadvisorAction,
} from "@/app/dashboard/[property]/[period]/restaurant/actions";
import { UploadControls, type UploadImage } from "@/components/sales/upload-controls";
import type { TripadvisorSummary } from "@/lib/dashboard-data";
import { TRIPADVISOR_METRICS } from "@/lib/sales/tripadvisor-logic";
import { cn } from "@/lib/utils";

const HERO = [
  { field: "rating", label: "Rating (/5)", hint: "e.g. 5.0" },
  { field: "rank", label: "Ranking (#)", hint: "e.g. 1" },
  { field: "totalInMarket", label: "Out of", hint: "e.g. 483" },
] as const;

const ALL_FIELDS = [
  ...HERO.map((h) => h.field as string),
  ...TRIPADVISOR_METRICS.flatMap((m) => (m.momField ? [m.valueField as string, m.momField as string] : [m.valueField as string])),
];
type Form = Record<string, string>;

const emptyForm = (): Form => Object.fromEntries(ALL_FIELDS.map((f) => [f, ""]));

function formFromInitial(initial: TripadvisorSummary | null): Form {
  const f = emptyForm();
  if (!initial) return f;
  if (initial.rating != null) f.rating = String(initial.rating);
  if (initial.rank != null) f.rank = String(initial.rank);
  if (initial.totalInMarket != null) f.totalInMarket = String(initial.totalInMarket);
  for (const m of TRIPADVISOR_METRICS) {
    const metric = initial.metrics.find((x) => x.key === m.key);
    if (!metric) continue;
    f[m.valueField] = String(metric.value);
    if (m.momField && metric.reportedMom != null) f[m.momField] = String(metric.reportedMom);
  }
  return f;
}

type SaveTripadvisorAction = (input: {
  property: string;
  period: string;
  core: Record<string, unknown>;
}) => Promise<{ ok: boolean; message: string }>;

export function TripadvisorUploader({
  property,
  period,
  initial,
  hasData,
  saveAction = saveRestaurantTripadvisorAction,
}: {
  property: string;
  period: string;
  initial: TripadvisorSummary | null;
  hasData: boolean;
  /** Save action — defaults to the restaurant one; the spa page passes its own
   *  so the save writes the SPA unit and revalidates the spa route. */
  saveAction?: SaveTripadvisorAction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [form, setForm] = useState<Form>(() => formFromInitial(initial));
  const [text, setText] = useState("");
  const [image, setImage] = useState<UploadImage>(null);
  const [busyKind, setBusyKind] = useState<null | "compile" | "save">(null);
  const busy = busyKind !== null;
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setCell = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  function compile() {
    setMsg(null);
    setBusyKind("compile");
    void (async () => {
      try {
        const r = await extractRestaurantTripadvisorAction({
          property,
          text: text.trim() || null,
          imageBase64: image?.base64 ?? null,
          imageMediaType: image?.mediaType ?? null,
        });
        if (r.ok && r.values) {
          setForm((f) => {
            const next = { ...f };
            for (const [k, v] of Object.entries(r.values!)) if (k in next) next[k] = String(v);
            return next;
          });
          setMsg({ ok: true, text: `Read ${Object.keys(r.values).length} figure(s) — review, then save.` });
        } else {
          setMsg({ ok: false, text: r.error ?? "Could not read that." });
        }
      } catch {
        setMsg({ ok: false, text: "Could not compile — please try again." });
      } finally {
        setBusyKind(null);
      }
    })();
  }

  function save() {
    setMsg(null);
    setBusyKind("save");
    void (async () => {
      try {
        const r = await saveAction({ property, period, core: form });
        setMsg({ ok: r.ok, text: r.message });
        if (r.ok) router.refresh();
      } finally {
        setBusyKind(null);
      }
    })();
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10">
        {hasData ? "Edit / re-upload" : "Upload / compile with AI"}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Tripadvisor — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the Tripadvisor listing report (Performance / Reviews / Listing engagement) or attach a screenshot, then
        compile — or type the figures in. For each metric capture the value and its &ldquo;vs previous period&rdquo; %
        (negative for a red/down arrow).
      </p>

      <UploadControls
        compact
        placeholder="Paste the Tripadvisor report (rating, ranking, impressions, visitors, reviews, engagement…)…"
        text={text}
        onText={setText}
        image={image}
        onImage={setImage}
        onCompile={compile}
        working={busyKind === "compile"}
        disabled={busy}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        {HERO.map((h) => (
          <label key={h.field} className="flex flex-col gap-1 text-xs text-muted-foreground">
            {h.label}
            <input value={form[h.field] ?? ""} onChange={(e) => setCell(h.field, e.target.value)} inputMode="decimal" placeholder={h.hint}
              className="rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
          </label>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-2 py-1.5">Metric</th>
              <th className="px-2 py-1.5 text-right">Value</th>
              <th className="px-2 py-1.5 text-right">MoM % (signed)</th>
            </tr>
          </thead>
          <tbody>
            {TRIPADVISOR_METRICS.map((m) => (
              <tr key={m.key} className="border-b border-border/60">
                <td className="px-2 py-1.5 text-xs text-foreground">{m.label}</td>
                <td className="px-2 py-1.5">
                  <input value={form[m.valueField] ?? ""} onChange={(e) => setCell(m.valueField, e.target.value)} inputMode="numeric" placeholder="0"
                    className="w-28 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                </td>
                <td className="px-2 py-1.5">
                  {m.momField ? (
                    <input value={form[m.momField] ?? ""} onChange={(e) => setCell(m.momField!, e.target.value)} inputMode="decimal" placeholder="e.g. -9"
                      className="w-24 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                  ) : (
                    <span className="block pr-2 text-right text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50">
          {busyKind === "save" ? "Saving…" : "Save Tripadvisor report"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
