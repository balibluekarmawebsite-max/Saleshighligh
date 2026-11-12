"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import {
  generateRestaurantOverviewAction,
  saveRestaurantOverviewAction,
} from "@/app/dashboard/[property]/[period]/restaurant/actions";
import {
  OVERVIEW_SECTIONS,
  OVERVIEW_SECTION_LABEL,
  bulletsFromText,
  bulletsToText,
  isOverviewEmpty,
  parseOverview,
  type OverviewSection,
} from "@/lib/sales/restaurant-overview";
import { cn } from "@/lib/utils";

const BULLET_SECTIONS: OverviewSection[] = ["challenges", "highlights", "marketing"];

function BulletBlock({ title, items, accent, dot }: { title: string; items: string[]; accent: string; dot: string }) {
  return (
    <div>
      <p className={cn("text-sm font-semibold", accent)}>{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-foreground">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className={cn("mt-2 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">—</p>
      )}
    </div>
  );
}

export function RestaurantOverviewPanel({
  property,
  period,
  content,
  aiGenerated,
  canEdit,
}: {
  property: string;
  period: string;
  content: string | null;
  aiGenerated: boolean;
  canEdit: boolean;
}) {
  const data = parseOverview(content);
  const empty = isOverviewEmpty(data);
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Overview</h3>
          <p className="mt-1 text-sm text-muted-foreground">Key challenges, positive highlights, marketing focus and the key takeaway.</p>
        </div>
        <div className="flex items-center gap-2">
          {aiGenerated && !empty && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--brand-gold))]/10 px-2 py-0.5 text-xs font-medium text-[hsl(var(--brand-gold))]">
              <Sparkles className="h-3 w-3" /> AI-assisted
            </span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md border border-brand-teal px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-teal/10"
            >
              {empty ? "Add overview" : "Edit overview"}
            </button>
          )}
        </div>
      </div>

      {empty ? (
        <p className="text-sm text-muted-foreground">No overview written for this period yet.</p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <BulletBlock title="Key Challenges" items={data.challenges} accent="text-variance-negative" dot="bg-variance-negative" />
            <BulletBlock title="Positive Highlights" items={data.highlights} accent="text-variance-positive" dot="bg-variance-positive" />
          </div>
          <BulletBlock title="Marketing Focus" items={data.marketing} accent="text-brand-teal" dot="bg-brand-teal" />
          {data.takeaway.trim() && (
            <div className="rounded-lg border border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/5 p-4">
              <p className="text-sm font-semibold text-foreground">Key Takeaway</p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">{data.takeaway}</p>
            </div>
          )}
        </div>
      )}

      {open && (
        <OverviewEditor
          property={property}
          period={period}
          initial={{
            challenges: bulletsToText(data.challenges),
            highlights: bulletsToText(data.highlights),
            marketing: bulletsToText(data.marketing),
            takeaway: data.takeaway,
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function OverviewEditor({
  property,
  period,
  initial,
  onClose,
}: {
  property: string;
  period: string;
  initial: Record<OverviewSection, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<OverviewSection, string>>(initial);
  const [aiUsed, setAiUsed] = useState(false);
  const [busySection, setBusySection] = useState<OverviewSection | null>(null);
  const [saving, startSave] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function generate(section: OverviewSection) {
    setMsg(null);
    setBusySection(section);
    void (async () => {
      const r = await generateRestaurantOverviewAction({ property, period, section });
      setBusySection(null);
      if (r.ok && r.text != null) {
        setForm((f) => ({ ...f, [section]: r.text! }));
        setAiUsed(true);
      } else {
        setMsg({ ok: false, text: r.error ?? "Could not generate." });
      }
    })();
  }

  function save() {
    setMsg(null);
    startSave(async () => {
      const r = await saveRestaurantOverviewAction({
        property,
        period,
        data: {
          challenges: bulletsFromText(form.challenges),
          highlights: bulletsFromText(form.highlights),
          marketing: bulletsFromText(form.marketing),
          takeaway: form.takeaway.trim(),
        },
        aiGenerated: aiUsed,
      });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-3xl rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-sm font-semibold text-foreground">Edit Restaurant Overview · {period}</p>
          <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">
            Close
          </button>
        </div>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
          {OVERVIEW_SECTIONS.map((section) => (
            <div key={section}>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">
                  {OVERVIEW_SECTION_LABEL[section]}
                  {BULLET_SECTIONS.includes(section) && <span className="ml-1 font-normal">(one bullet per line)</span>}
                </label>
                <button
                  type="button"
                  onClick={() => generate(section)}
                  disabled={busySection !== null || saving}
                  className="inline-flex items-center gap-1 text-xs font-medium text-brand-teal transition-colors hover:underline disabled:opacity-50"
                >
                  <Sparkles className="h-3 w-3" />
                  {busySection === section ? "Generating…" : "Generate with AI"}
                </button>
              </div>
              <textarea
                value={form[section]}
                onChange={(e) => setForm((f) => ({ ...f, [section]: e.target.value }))}
                rows={section === "takeaway" ? 3 : 4}
                placeholder={
                  BULLET_SECTIONS.includes(section)
                    ? "One point per line…"
                    : "A short 2–3 sentence summary and the key priority…"
                }
                className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
          {msg ? (
            <span className={cn("text-xs", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</span>
          ) : (
            <span className="text-xs text-muted-foreground">Figures come from the imported F&amp;B data; the AI only quotes them.</span>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || busySection !== null}
              className="rounded-md bg-brand-gold px-3 py-1.5 text-sm font-medium text-brand-teal transition-colors hover:bg-brand-gold/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save overview"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
