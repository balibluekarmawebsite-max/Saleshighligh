"use server";

import { revalidatePath } from "next/cache";

import { canEditProperty, getCurrentUser } from "@/lib/auth-helpers";
import { extractBookingOverview } from "@/lib/sales/booking-overview-ai";
import { saveBookingOverview } from "@/lib/sales/booking-overview-import";
import type { BookingOverviewCore, NormalAvailRow, RawAvailRow } from "@/lib/sales/booking-overview-logic";
import { extractSojern } from "@/lib/sales/sojern-ai";
import { saveSojern } from "@/lib/sales/sojern-import";
import type { NormalSojernMeta, NormalSojernPoint, RawSojernMeta, RawSojernPoint, SojernMetric } from "@/lib/sales/sojern-logic";
import { extractBookingWindow } from "@/lib/sales/booking-window-ai";
import { saveBookingWindow } from "@/lib/sales/booking-window-import";
import type {
  NormalBookingWindowMeta,
  NormalBookingWindowRow,
  RawBookingWindowMeta,
  RawBookingWindowRow,
} from "@/lib/sales/booking-window-logic";
import { extractMarketArea } from "@/lib/sales/market-area-ai";
import { saveMarketArea } from "@/lib/sales/market-area-import";
import type { RawMarketAreaRow } from "@/lib/sales/market-area-logic";

export interface SaveResult {
  ok: boolean;
  message: string;
}

export interface MarketAreaExtractActionResult {
  ok: boolean;
  error?: string;
  rows?: RawMarketAreaRow[];
}

/** Editor/admin: AI-extract the Booking.com Market Area monthly series (preview only). */
export async function extractMarketAreaAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<MarketAreaExtractActionResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractMarketArea({ text: input.text, image });
  return r.ok ? { ok: true, rows: r.rows } : { ok: false, error: r.error };
}

/** Editor/admin: save the Booking.com Market Area monthly series. */
export async function saveMarketAreaAction(input: {
  property: string;
  period: string;
  rows: RawMarketAreaRow[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveMarketArea({
    property: input.property,
    period: input.period,
    rows: input.rows,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/market`);
  return { ok: r.ok, message: r.message };
}

export interface BookingWindowExtractActionResult {
  ok: boolean;
  error?: string;
  meta?: NormalBookingWindowMeta;
  rows?: NormalBookingWindowRow[];
}

/** Editor/admin: AI-extract the Booking.com Booking Window series (preview only). */
export async function extractBookingWindowAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<BookingWindowExtractActionResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractBookingWindow({ text: input.text, image });
  return r.ok ? { ok: true, meta: r.meta, rows: r.rows } : { ok: false, error: r.error };
}

/** Editor/admin: save the Booking.com Booking Window series. */
export async function saveBookingWindowAction(input: {
  property: string;
  period: string;
  meta: RawBookingWindowMeta;
  rows: RawBookingWindowRow[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveBookingWindow({
    property: input.property,
    period: input.period,
    meta: input.meta,
    rows: input.rows,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/market`);
  return { ok: r.ok, message: r.message };
}

export interface BookingOverviewExtractActionResult {
  ok: boolean;
  error?: string;
  core?: BookingOverviewCore;
  avail?: NormalAvailRow[];
}

/** Editor/admin: AI-extract the Booking.com Overview (preview only). */
export async function extractBookingOverviewAction(input: {
  property: string;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<BookingOverviewExtractActionResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractBookingOverview({ text: input.text, image });
  return r.ok ? { ok: true, core: r.core, avail: r.avail } : { ok: false, error: r.error };
}

/** Editor/admin: save the Booking.com Overview (funnel + availability trend). */
export async function saveBookingOverviewAction(input: {
  property: string;
  period: string;
  core: Record<string, unknown>;
  avail: RawAvailRow[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveBookingOverview({
    property: input.property,
    period: input.period,
    core: input.core,
    avail: input.avail,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/market`);
  return { ok: r.ok, message: r.message };
}

export interface SojernExtractActionResult {
  ok: boolean;
  error?: string;
  meta?: NormalSojernMeta;
  points?: NormalSojernPoint[];
}

/** Editor/admin: AI-extract one Sojern chart (flight or hotel), preview only. */
export async function extractSojernAction(input: {
  property: string;
  metric?: SojernMetric | null;
  text?: string | null;
  imageBase64?: string | null;
  imageMediaType?: string | null;
}): Promise<SojernExtractActionResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, error: "You don't have edit access to this property." };
  }
  const image =
    input.imageBase64 && input.imageMediaType
      ? { data: input.imageBase64, mediaType: input.imageMediaType }
      : null;
  const r = await extractSojern({ text: input.text, image, metric: input.metric ?? null });
  return r.ok ? { ok: true, meta: r.meta, points: r.points } : { ok: false, error: r.error };
}

/** Editor/admin: save the Sojern Market Overview (filters + flight/hotel index). */
export async function saveSojernAction(input: {
  property: string;
  period: string;
  meta: RawSojernMeta;
  points: RawSojernPoint[];
}): Promise<SaveResult> {
  const user = await getCurrentUser();
  if (!canEditProperty(user, input.property)) {
    return { ok: false, message: "You don't have edit access to this property." };
  }
  const r = await saveSojern({
    property: input.property,
    period: input.period,
    meta: input.meta,
    points: input.points,
    source: "manual-or-ai",
    uploadedBy: user?.email ?? null,
  });
  if (r.ok) revalidatePath(`/dashboard/${input.property}/${input.period}/market`);
  return { ok: r.ok, message: r.message };
}
