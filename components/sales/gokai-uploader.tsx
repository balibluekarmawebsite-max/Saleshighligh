"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  extractRestaurantGokaiAction,
  saveRestaurantGokaiAction,
} from "@/app/dashboard/[property]/[period]/restaurant/actions";
import { UploadControls, type UploadImage } from "@/components/sales/upload-controls";
import type { GokaiSummary } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

interface Metric {
  key: string;
  label: string;
  valueField: string;
  /** The reported-MoM column, or null for cards that have none (Product Views /
   *  Refunds): the Spa page computes their MoM from the prior period. */
  momField: string | null;
  hint: string;
}

/** Restaurant / Hotel: the "Guest Experience" six-card report. */
const RESTAURANT_METRICS: Metric[] = [
  { key: "signups", label: "Guests Added", valueField: "signups", momField: "signupsMom", hint: "e.g. 293" },
  { key: "openRate", label: "Guest Journey Open Rate", valueField: "openRatePct", momField: "openRateMom", hint: "% e.g. 40.816" },
  { key: "ctr", label: "Guest Journey Click-through Rate", valueField: "ctrPct", momField: "ctrMom", hint: "% e.g. 21.245" },
  { key: "survey", label: "Pre-arrival Survey Completion", valueField: "surveyCompletionPct", momField: "surveyMom", hint: "% e.g. 6.78" },
  { key: "upsellSales", label: "Upsell Sales", valueField: "upsellSales", momField: "upsellSalesMom", hint: "transactions" },
  { key: "upsellRevenue", label: "Upsell Revenue", valueField: "upsellRevenue", momField: "upsellRevenueMom", hint: "IDR" },
];

/** Spa: the "Upsell Analytics" four-card report the Spa page displays. */
const SPA_METRICS: Metric[] = [
  { key: "productViews", label: "Product Views", valueField: "productViews", momField: null, hint: "e.g. 135" },
  { key: "upsellSales", label: "Upsell Sales", valueField: "upsellSales", momField: "upsellSalesMom", hint: "transactions" },
  { key: "upsellRevenue", label: "Upsell Revenue", valueField: "upsellRevenue", momField: "upsellRevenueMom", hint: "IDR" },
  { key: "refunds", label: "Refunds", valueField: "refunds", momField: null, hint: "e.g. 0" },
];

const UNITS = ["RESTAURANT", "HOTEL", "SPA"] as const;
type Unit = (typeof UNITS)[number];

const metricsFor = (unit: Unit): Metric[] => (unit === "SPA" ? SPA_METRICS : RESTAURANT_METRICS);

const ALL_FIELDS = Array.from(
  new Set([...RESTAURANT_METRICS, ...SPA_METRICS].flatMap((m) => (m.momField ? [m.valueField, m.momField] : [m.valueField]))),
);
type Form = Record<string, string>;

const emptyForm = (): Form => Object.fromEntries(ALL_FIELDS.map((f) => [f, ""]));

function formFromInitial(initial: GokaiSummary | null): Form {
  const f = emptyForm();
  if (!initial) return f;
  for (const m of metricsFor((initial.unit as Unit) ?? "RESTAURANT")) {
    const metric = initial.metrics.find((x) => x.key === m.key);
    if (metric) {
      f[m.valueField] = String(metric.value);
      if (m.momField) f[m.momField] = metric.reportedMom != null ? String(metric.reportedMom) : "";
    }
  }
  return f;
}

type SaveGokaiAction = (input: {
  property: string;
  period: string;
  unit?: string;
  core: Record<string, unknown>;
}) => Promise<{ ok: boolean; message: string }>;

export function GokaiUploader({
  property,
  period,
  initial,
  hasData,
  defaultUnit = "RESTAURANT",
  saveAction = saveRestaurantGokaiAction,
}: {
  property: string;
  period: string;
  initial: GokaiSummary | null;
  hasData: boolean;
  /** Unit pre-selected when there is no saved report yet (e.g. "SPA" on the spa page). */
  defaultUnit?: Unit;
  /** Save action — defaults to the restaurant one; the spa page passes its own
   *  so the save revalidates the spa route. */
  saveAction?: SaveGokaiAction;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [unit, setUnit] = useState<Unit>(((initial?.unit as Unit) ?? defaultUnit));
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
        const r = await extractRestaurantGokaiAction({
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
        const r = await saveAction({ property, period, unit, core: form });
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
        <p className="text-sm font-medium text-foreground">Gokai CRM — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Close</button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the Gokai report (Guest Experience or Upsell Analytics) or attach a screenshot, then compile — or type the
        metrics in. Capture each card&rsquo;s value and its &ldquo;% from last month&rdquo; (negative for a red/down arrow).
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-muted-foreground">Unit</label>
        <select value={unit} onChange={(e) => setUnit(e.target.value as Unit)}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus:border-brand-teal focus:outline-none">
          {UNITS.map((u) => (
            <option key={u} value={u}>{u === "RESTAURANT" ? "Restaurant" : u === "HOTEL" ? "Hotel" : "Spa"}</option>
          ))}
        </select>
      </div>

      <UploadControls
        compact
        placeholder="Paste the Gokai Guest Experience metrics (value + % from last month per card)…"
        text={text}
        onText={setText}
        image={image}
        onImage={setImage}
        onCompile={compile}
        working={busyKind === "compile"}
        disabled={busy}
      />

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
            {metricsFor(unit).map((m) => (
              <tr key={m.key} className="border-b border-border/60">
                <td className="px-2 py-1.5 text-xs text-foreground">{m.label}</td>
                <td className="px-2 py-1.5">
                  <input value={form[m.valueField] ?? ""} onChange={(e) => setCell(m.valueField, e.target.value)} inputMode="decimal" placeholder={m.hint}
                    className="w-28 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                </td>
                <td className="px-2 py-1.5">
                  {m.momField ? (
                    <input value={form[m.momField] ?? ""} onChange={(e) => setCell(m.momField!, e.target.value)} inputMode="decimal" placeholder="e.g. -34.664"
                      className="w-24 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
                  ) : (
                    <span className="block text-right text-xs text-muted-foreground" title="MoM is computed from the prior month for this metric">—</span>
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
          {busyKind === "save" ? "Saving…" : "Save Gokai report"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
