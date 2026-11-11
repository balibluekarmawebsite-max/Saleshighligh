"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser, hasRole } from "@/lib/auth-helpers";
import { parseArrivalGuestCsv } from "@/lib/sales/arrival-guest-csv";
import { compileGuestArrivals } from "@/lib/sales/guest-arrivals-logic";
import { runGuestArrivalsImport } from "@/lib/sales/guest-arrivals-import";

export interface GuestCsvPreview {
  ok: boolean;
  error?: string;
  meta?: { periodHint: string | null; propertyHint: string | null; rowCount: number; skipped: number };
  nationalities?: { countryCode: string | null; countryName: string; roomNights: number; guests: number | null }[];
  los?: { losBucket: string; bookings: number; roomNights: number }[];
  totals?: { arrivals: number; roomNights: number; guests: number | null; skipped: number };
}

/** Editor/admin: parse + compile the CSV for a preview (no DB write). */
export async function previewGuestCsvAction(csvText: string): Promise<GuestCsvPreview> {
  const user = await getCurrentUser();
  if (!hasRole(user, ["ADMIN", "EDITOR"])) return { ok: false, error: "Editors and admins only." };
  if (!csvText || !csvText.trim()) return { ok: false, error: "Paste or upload the Arrival Guest CSV first." };

  const parsed = parseArrivalGuestCsv(csvText);
  if (!parsed.meta.headerFound) {
    return { ok: false, error: "Couldn't find the Arrival Guest header row — is this the right report CSV?" };
  }
  const c = compileGuestArrivals(parsed.arrivals);
  if (c.nationality.length === 0) return { ok: false, error: "No valid arrivals found in the CSV." };

  return {
    ok: true,
    meta: {
      periodHint: parsed.meta.periodHint,
      propertyHint: parsed.meta.propertyHint,
      rowCount: parsed.meta.rowCount,
      skipped: parsed.meta.skipped,
    },
    nationalities: c.nationality,
    los: c.los,
    totals: c.totals,
  };
}

export interface GuestCsvImportInput {
  property: string;
  period: string; // YYYY-MM
  scope: "MTD" | "YTD";
  csvText: string;
  lastYearCsvText?: string;
}

/** Editor/admin (+ property access): compile the CSV and store it. */
export async function importGuestCsvAction(input: GuestCsvImportInput): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();
  if (!hasRole(user, ["ADMIN", "EDITOR"])) return { ok: false, message: "Editors and admins only." };
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: `You don't have edit access to ${input.property}.` };
  }

  const parsed = parseArrivalGuestCsv(input.csvText ?? "");
  const lastYearArrivals = input.lastYearCsvText?.trim()
    ? parseArrivalGuestCsv(input.lastYearCsvText).arrivals
    : undefined;

  const r = await runGuestArrivalsImport({
    property: input.property,
    period: input.period,
    scope: input.scope,
    arrivals: parsed.arrivals,
    lastYearArrivals,
    source: "admin-csv-upload",
    uploadedBy: user?.email ?? null,
  });

  if (r.body.ok) revalidatePath("/dashboard", "layout");
  return r.body.ok ? { ok: true, message: r.body.message } : { ok: false, message: r.body.error };
}
