"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { extractMealSalesAction, saveMealSalesAction } from "@/app/dashboard/[property]/[period]/restaurant/actions";
import type { MealRow } from "@/lib/dashboard-data";
import { MEAL_PERIODS, MEAL_PERIOD_LABEL, type MealPeriod } from "@/lib/sales/restaurant-sales-logic";
import { cn } from "@/lib/utils";

type Field = "coversActual" | "coversBudget" | "revenueActual" | "revenueBudget";
const FIELDS: { key: Field; label: string }[] = [
  { key: "coversActual", label: "Covers (Actual)" },
  { key: "coversBudget", label: "Covers (Budget)" },
  { key: "revenueActual", label: "Revenue (Actual)" },
  { key: "revenueBudget", label: "Revenue (Budget)" },
];

type Form = Record<MealPeriod, Record<Field, string>>;
const emptyForm = (initial: MealRow[]): Form => {
  const f = {} as Form;
  for (const m of MEAL_PERIODS) f[m] = { coversActual: "", coversBudget: "", revenueActual: "", revenueBudget: "" };
  for (const m of initial) {
    const key = m.meal as MealPeriod;
    if (f[key]) {
      f[key] = {
        coversActual: m.coversActual ? String(m.coversActual) : "",
        coversBudget: m.coversBudget ? String(m.coversBudget) : "",
        revenueActual: m.revenueActual ? String(m.revenueActual) : "",
        revenueBudget: m.revenueBudget ? String(m.revenueBudget) : "",
      };
    }
  }
  return f;
};

export function RestaurantSalesUploader({
  property,
  period,
  initial,
  hasData,
}: {
  property: string;
  period: string;
  initial: MealRow[];
  hasData: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!hasData);
  const [text, setText] = useState("");
  const [image, setImage] = useState<{ base64: string; mediaType: string; name: string } | null>(null);
  const [form, setForm] = useState<Form>(() => emptyForm(initial));
  const [busy, startBusy] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickImage(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      setImage({ base64, mediaType: file.type || "image/png", name: file.name });
    };
    reader.readAsDataURL(file);
  }

  function setCell(meal: MealPeriod, field: Field, value: string) {
    setForm((f) => ({ ...f, [meal]: { ...f[meal], [field]: value } }));
  }

  function compile() {
    setMsg(null);
    startBusy(async () => {
      const r = await extractMealSalesAction({
        property,
        text: text.trim() || null,
        imageBase64: image?.base64 ?? null,
        imageMediaType: image?.mediaType ?? null,
      });
      if (r.ok && r.meals) {
        setForm((prev) => {
          const next = { ...prev };
          for (const m of r.meals!) {
            next[m.mealPeriod] = {
              coversActual: String(m.coversActual),
              coversBudget: String(m.coversBudget),
              revenueActual: String(m.revenueActual),
              revenueBudget: String(m.revenueBudget),
            };
          }
          return next;
        });
        setMsg({ ok: true, text: `Read ${r.meals.length} meal period(s) — review, then save.` });
      } else {
        setMsg({ ok: false, text: r.error ?? "Could not read the table." });
      }
    });
  }

  function save() {
    const meals = MEAL_PERIODS.map((m) => ({ meal: m, ...form[m] })).filter(
      (r) => r.coversActual.trim() !== "" && r.revenueActual.trim() !== "",
    );
    if (meals.length === 0) {
      setMsg({ ok: false, text: "Enter at least one meal's covers and revenue." });
      return;
    }
    setMsg(null);
    startBusy(async () => {
      const r = await saveMealSalesAction({ property, period, meals });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
      >
        {hasData ? "Edit / re-upload" : "Upload / compile with AI"}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Restaurant Sales — upload &amp; compile for {period}</p>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">
          Close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Paste the sales table or attach a screenshot, then compile with AI — or type the figures straight into the grid.
        Only covers and revenue are stored; average check, the %, Difference and TOTAL are computed.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="Paste the Breakfast/Lunch/Dinner covers + revenue (actual & budget)…"
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pickImage(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          {image ? `📎 ${image.name}` : "Attach screenshot / file"}
        </button>
        {image && (
          <button type="button" onClick={() => setImage(null)} className="text-xs text-variance-negative hover:underline">
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={compile}
          disabled={busy || (!text.trim() && !image)}
          className="ml-auto rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {busy ? "Working…" : "Compile with AI"}
        </button>
      </div>

      {/* Editable grid (preview) */}
      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-2 py-1.5">Meal</th>
              {FIELDS.map((f) => (
                <th key={f.key} className="px-2 py-1.5 text-right">{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MEAL_PERIODS.map((m) => (
              <tr key={m} className="border-b border-border/60">
                <td className="px-2 py-1.5 text-foreground">{MEAL_PERIOD_LABEL[m]}</td>
                {FIELDS.map((f) => (
                  <td key={f.key} className="px-2 py-1.5">
                    <input
                      value={form[m][f.key]}
                      onChange={(e) => setCell(m, f.key, e.target.value)}
                      inputMode="numeric"
                      placeholder="0"
                      className="w-28 rounded-md border border-border bg-card px-2 py-1 text-right text-xs tabular-nums text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save sales"}
        </button>
        {msg && <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>}
      </div>
    </div>
  );
}
