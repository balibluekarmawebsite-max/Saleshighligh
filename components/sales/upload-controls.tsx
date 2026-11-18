"use client";

import { useRef } from "react";

export type UploadImage = { base64: string; mediaType: string; name: string } | null;

/** A scoped upload control: paste textarea + screenshot/file attach + Compile.
 * Used by the per-part Chope uploads and anywhere a single AI-read slot is
 * needed. The file input clears after each pick so the same file re-attaches. */
export function UploadControls({
  placeholder,
  text,
  onText,
  image,
  onImage,
  onCompile,
  working,
  disabled,
  compact = false,
}: {
  placeholder: string;
  text: string;
  onText: (v: string) => void;
  image: UploadImage;
  onImage: (v: UploadImage) => void;
  onCompile: () => void;
  working: boolean;
  disabled: boolean;
  compact?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  function pick(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.slice(result.indexOf(",") + 1) : result;
      onImage({ base64, mediaType: file.type || "image/png", name: file.name });
    };
    reader.readAsDataURL(file);
  }
  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-brand-teal focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0]);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground">
          {image ? `📎 ${image.name}` : "Attach screenshot / file"}
        </button>
        {image && (
          <button type="button" onClick={() => onImage(null)} className="text-xs text-variance-negative hover:underline">
            Remove
          </button>
        )}
        <button
          type="button"
          onClick={onCompile}
          disabled={disabled || (!text.trim() && !image)}
          className="ml-auto rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90 disabled:opacity-50"
        >
          {working ? "Working…" : "Compile with AI"}
        </button>
      </div>
    </div>
  );
}
