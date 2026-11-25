"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  listSocialBrandsAction,
  saveSocialUnitBrandAction,
  syncMonthlySocialAction,
} from "@/app/dashboard/[property]/[period]/social/actions";
import type { MetricoolBrand } from "@/lib/weekly/metricool";
import { cn } from "@/lib/utils";

type Unit = "HOTEL" | "RESTAURANT" | "SPA";
const UNITS: { unit: Unit; label: string }[] = [
  { unit: "HOTEL", label: "Hotel" },
  { unit: "RESTAURANT", label: "Restaurant" },
  { unit: "SPA", label: "Spa" },
];

export interface UnitBrandInit {
  unit: Unit;
  blogId: string | null;
}

/**
 * Metricool monthly-sync panel for the Social page. Editors can pull each
 * business unit's Instagram / Facebook / TikTok / YouTube metrics for the month;
 * admins can assign which Metricool brand feeds each unit (the hotel uses the
 * shared property brand). Shown to editors/admins only.
 */
export function SocialSyncPanel({
  property,
  period,
  brands: initialBrands,
  configured,
  isAdmin,
}: {
  property: string;
  period: string;
  brands: UnitBrandInit[];
  configured: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [blogIds, setBlogIds] = useState<Record<Unit, string>>(() => {
    const m = { HOTEL: "", RESTAURANT: "", SPA: "" } as Record<Unit, string>;
    for (const b of initialBrands) m[b.unit] = b.blogId ?? "";
    return m;
  });
  const [brandList, setBrandList] = useState<MetricoolBrand[] | null>(null);
  const [pickFor, setPickFor] = useState<Unit | null>(null);
  const [busyUnit, setBusyUnit] = useState<Unit | "ALL" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, startTransition] = useTransition();

  if (!configured) {
    return (
      <p className="text-xs text-muted-foreground">
        Metricool isn&rsquo;t configured — set <code>METRICOOL_USER_TOKEN</code> and{" "}
        <code>METRICOOL_USER_ID</code> on the server to auto-sync social metrics.
      </p>
    );
  }

  /** Persist the current brand input before syncing (admins only), so typing or
   *  browsing a brand and clicking Sync "just works" without a separate Save —
   *  the sync reads the SAVED brand from the server. Non-admins rely on the
   *  already-saved brand. Returns ok:false (with a message) if the save fails. */
  async function ensureSaved(unit: Unit): Promise<{ ok: boolean; message?: string }> {
    const id = blogIds[unit]?.trim();
    if (!isAdmin || !id) return { ok: true };
    const s = await saveSocialUnitBrandAction({ property, period, unit, blogId: id });
    return { ok: s.ok, message: s.message };
  }

  async function syncUnit(unit: Unit) {
    setMsg(null);
    setBusyUnit(unit);
    try {
      const saved = await ensureSaved(unit);
      if (!saved.ok) {
        setMsg({ ok: false, text: saved.message ?? "Could not save the brand." });
        return;
      }
      const r = await syncMonthlySocialAction({ property, period, unit });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    } finally {
      setBusyUnit(null);
    }
  }

  async function syncAll() {
    setMsg(null);
    setBusyUnit("ALL");
    const results: string[] = [];
    let anyOk = false;
    try {
      for (const { unit, label } of UNITS) {
        if (!blogIds[unit]?.trim()) continue; // skip units with no brand entered
        const saved = await ensureSaved(unit);
        if (!saved.ok) {
          results.push(`${label}: ✗ ${saved.message ?? "could not save brand"}`);
          continue;
        }
        const r = await syncMonthlySocialAction({ property, period, unit });
        if (r.ok) anyOk = true;
        results.push(`${label}: ${r.ok ? "✓" : "✗"} ${r.message}`);
      }
      setMsg(
        results.length
          ? { ok: anyOk, text: results.join("  ·  ") }
          : { ok: false, text: "No brands entered yet — enter a Metricool brand for at least the hotel." },
      );
      if (anyOk) router.refresh();
    } finally {
      setBusyUnit(null);
    }
  }

  function saveBrand(unit: Unit) {
    setMsg(null);
    startTransition(async () => {
      const r = await saveSocialUnitBrandAction({ property, period, unit, blogId: blogIds[unit] ?? "" });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) router.refresh();
    });
  }

  function loadBrands(unit: Unit) {
    setPickFor(unit);
    if (brandList) return;
    startTransition(async () => {
      const r = await listSocialBrandsAction();
      if (r.ok) setBrandList(r.brands ?? []);
      else setMsg({ ok: false, text: r.message ?? "Could not list brands." });
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
      >
        Sync from Metricool
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-secondary/20 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Metricool — monthly social sync for {period}</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Close
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pulls Instagram, Facebook, TikTok &amp; YouTube for the whole month. The hotel uses the property&rsquo;s
        Metricool brand; assign a separate brand for the restaurant/spa if they have their own accounts. TikTok/YouTube
        populate once their metric names are pinned (see deploy notes).
      </p>

      <div className="space-y-2">
        {UNITS.map(({ unit, label }) => {
          const hasBrand = !!blogIds[unit]?.trim();
          const busy = busyUnit === unit || busyUnit === "ALL";
          return (
            <div key={unit} className="rounded-md border border-border/70 bg-card p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-20 text-sm font-semibold text-foreground">{label}</span>
                {isAdmin ? (
                  <>
                    <input
                      value={blogIds[unit] ?? ""}
                      onChange={(e) => setBlogIds((m) => ({ ...m, [unit]: e.target.value }))}
                      placeholder={unit === "HOTEL" ? "property brand (blogId)" : "brand (blogId) — optional"}
                      className="h-8 w-44 rounded-md border border-border bg-card px-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => saveBrand(unit)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-secondary"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => loadBrands(unit)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-secondary"
                    >
                      Browse brands
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Brand: {hasBrand ? <code>{blogIds[unit]}</code> : "not assigned"}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => syncUnit(unit)}
                  disabled={busy || !hasBrand}
                  className="ml-auto rounded-md bg-brand-gold px-3 py-1 text-xs font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
                  title={hasBrand ? "" : "Assign a Metricool brand first"}
                >
                  {busyUnit === unit ? "Syncing…" : `Sync ${label}`}
                </button>
              </div>

              {isAdmin && pickFor === unit && brandList && (
                <div className="mt-2 rounded-md border border-border bg-muted/20 p-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    {brandList.length} brand{brandList.length === 1 ? "" : "s"} — click to assign to {label}:
                  </p>
                  <ul className="max-h-40 space-y-0.5 overflow-y-auto">
                    {brandList.map((b) => (
                      <li key={b.blogId}>
                        <button
                          type="button"
                          onClick={() => {
                            setBlogIds((m) => ({ ...m, [unit]: b.blogId }));
                            setPickFor(null);
                          }}
                          className="text-left text-xs text-primary hover:underline"
                        >
                          {b.label} <span className="text-muted-foreground">· {b.blogId}</span>
                        </button>
                      </li>
                    ))}
                    {brandList.length === 0 && <li className="text-xs text-muted-foreground">No brands returned.</li>}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={syncAll}
          disabled={busyUnit !== null}
          className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10 disabled:opacity-50"
        >
          {busyUnit === "ALL" ? "Syncing all…" : "Sync all assigned units"}
        </button>
        {msg && (
          <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}
