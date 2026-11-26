"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Images, Trash2 } from "lucide-react";

import {
  addPromotionImage,
  deletePromotionImage,
  updatePromotionCaption,
} from "@/app/dashboard/[property]/[period]/plans/promo-actions";
import type { PromoImageRow } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";

type Msg = { ok: boolean; text: string } | null;

/** One stored image: thumbnail + editable caption + delete (editors). */
function ImageItem({ img, canEdit }: { img: PromoImageRow; canEdit: boolean }) {
  const router = useRouter();
  const [caption, setCaption] = useState(img.caption ?? "");
  const [busy, start] = useTransition();

  function saveCaption() {
    if (caption.trim() === (img.caption ?? "").trim()) return;
    start(async () => {
      await updatePromotionCaption({ id: img.id, caption });
      router.refresh();
    });
  }
  function remove() {
    if (!confirm("Remove this promotion image?")) return;
    start(async () => {
      await deletePromotionImage(img.id);
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.imageUrl} alt={img.caption ?? "Promotion"} className="max-h-48 w-full bg-secondary/20 object-contain" />
      <div className="space-y-1 p-2">
        {canEdit ? (
          <div className="flex items-center gap-1">
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onBlur={saveCaption}
              placeholder="Caption…"
              disabled={busy}
              className="min-w-0 flex-1 rounded border border-border bg-card px-1.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
            />
            <button type="button" onClick={remove} disabled={busy} title="Remove"
              className="shrink-0 rounded p-1 text-variance-negative hover:bg-variance-negative/10 disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          img.caption && <p className="text-xs text-muted-foreground">{img.caption}</p>
        )}
      </div>
    </div>
  );
}

/** The add-image control for a unit. */
function AddControl({ property, period, unit }: { property: string; period: string; unit: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [caption, setCaption] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, start] = useTransition();

  function add() {
    const f = fileRef.current?.files?.[0];
    if (!f) {
      setMsg({ ok: false, text: "Choose an image first." });
      return;
    }
    setMsg(null);
    const fd = new FormData();
    fd.set("property", property);
    fd.set("period", period);
    fd.set("unit", unit);
    fd.set("caption", caption);
    fd.set("file", f);
    start(async () => {
      const r = await addPromotionImage(fd);
      if (r.ok) {
        setCaption("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } else {
        setMsg({ ok: false, text: r.message ?? "Could not add." });
      }
    });
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed border-border p-2">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp"
        className="block w-full text-[11px] text-muted-foreground file:mr-2 file:rounded file:border-0 file:bg-brand-teal/10 file:px-2 file:py-1 file:text-[11px] file:text-brand-teal" />
      <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Caption (optional)"
        className="w-full rounded border border-border bg-card px-1.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none" />
      <button type="button" onClick={add} disabled={busy}
        className="inline-flex items-center gap-1 rounded-md border border-brand-teal px-2 py-1 text-xs font-medium text-brand-teal hover:bg-brand-teal/10 disabled:opacity-50">
        <ImagePlus className="h-3.5 w-3.5" /> {busy ? "Uploading…" : "Add image"}
      </button>
      {msg && <p className={cn("text-[11px]", msg.ok ? "text-variance-positive" : "text-variance-negative")}>{msg.text}</p>}
    </div>
  );
}

/** One unit's promo gallery (Rooms / restaurant / spa / Wellness). */
function UnitGallery({
  property,
  period,
  unit,
  label,
  items,
  canEdit,
}: {
  property: string;
  period: string;
  unit: string;
  label: string;
  items: PromoImageRow[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      {items.length > 0 ? (
        <div className="space-y-2">
          {items.map((img) => (
            <ImageItem key={img.id} img={img} canEdit={canEdit} />
          ))}
        </div>
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-border bg-secondary/40">
          <span className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
            <Images className="h-5 w-5" aria-hidden />
            No promo images
          </span>
        </div>
      )}
      {canEdit && <AddControl property={property} period={period} unit={unit} />}
    </div>
  );
}

/** Ongoing-promotion image galleries, one per unit. */
export function PromoGalleries({
  property,
  period,
  units,
  images,
  canEdit,
}: {
  property: string;
  period: string;
  units: { key: string; label: string }[];
  images: Record<string, PromoImageRow[]>;
  canEdit: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {units.map((u) => (
        <UnitGallery
          key={u.key}
          property={property}
          period={period}
          unit={u.key}
          label={u.label}
          items={images[u.key] ?? []}
          canEdit={canEdit}
        />
      ))}
    </div>
  );
}
