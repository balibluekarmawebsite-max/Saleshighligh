"use client";

import { useState, useTransition } from "react";
import { Check, Link2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  saveMetricoolBlogId,
  testMetricoolConnection,
} from "@/lib/weekly/metricool-actions";
import type { MetricoolBrand } from "@/lib/weekly/metricool";

/** Assign this property's Metricool brand (blogId) + list brands to pick from. */
export function MetricoolSettings({
  property,
  currentBlogId,
  configured,
  isAdmin,
}: {
  property: string;
  currentBlogId: string | null;
  configured: boolean;
  isAdmin: boolean;
}) {
  const [blogId, setBlogId] = useState(currentBlogId ?? "");
  const [brands, setBrands] = useState<MetricoolBrand[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();
  const [testing, startTesting] = useTransition();

  if (!configured) {
    return (
      <p className="text-xs text-muted-foreground">
        Set <code>METRICOOL_USER_TOKEN</code> and <code>METRICOOL_USER_ID</code> on the server, then
        assign a brand to each property here.
      </p>
    );
  }
  if (!isAdmin) {
    return (
      <p className="text-sm text-muted-foreground">
        Brand: {currentBlogId ? <code className="text-xs">{currentBlogId}</code> : "not assigned"} —
        an administrator assigns this.
      </p>
    );
  }

  function save() {
    setSaved(false);
    setError(null);
    const fd = new FormData();
    fd.set("property", property);
    fd.set("blogId", blogId.trim());
    startSaving(async () => {
      const r = await saveMetricoolBlogId(fd);
      if (r.ok) setSaved(true);
      else setError(r.message ?? "Save failed.");
    });
  }

  function test() {
    setError(null);
    setBrands(null);
    startTesting(async () => {
      const r = await testMetricoolConnection();
      if (r.ok) setBrands(r.brands ?? []);
      else setError(r.message ?? "Connection failed.");
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {property} brand (blogId)
          </span>
          <input
            value={blogId}
            onChange={(e) => { setBlogId(e.target.value); setSaved(false); }}
            placeholder="e.g. 1234567"
            className="h-9 w-48 rounded-md border border-border bg-card px-3 text-sm text-foreground"
          />
        </label>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Check />} Save
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={test} disabled={testing}>
          {testing ? <Loader2 className="animate-spin" /> : <Link2 className="h-4 w-4" />} Test connection
        </Button>
        {saved && <span className="text-xs text-variance-positive">Saved.</span>}
      </div>

      {error && <p className="text-sm text-variance-negative">{error}</p>}

      {brands && (
        <div className="rounded-md border border-border bg-muted/20 p-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {brands.length} brand{brands.length === 1 ? "" : "s"} on this account — click to assign:
          </p>
          <ul className="space-y-0.5">
            {brands.map((b) => (
              <li key={b.blogId}>
                <button
                  type="button"
                  onClick={() => { setBlogId(b.blogId); setSaved(false); }}
                  className="text-left text-sm text-primary hover:underline"
                >
                  {b.label} <span className="text-muted-foreground">· {b.blogId}</span>
                </button>
              </li>
            ))}
            {brands.length === 0 && <li className="text-sm text-muted-foreground">No brands returned.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
