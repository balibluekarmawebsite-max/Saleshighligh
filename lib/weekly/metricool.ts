/**
 * Metricool integration for Section H (Social Media Insight).
 *
 * Model: one Metricool login (a single user token + user id, held in server
 * env) with a separate brand ("blogId") per property. The per-property blogId
 * is stored in the existing WeeklySetting table (group "metricool", key
 * "blogId") so it can be assigned from the UI — no schema change.
 *
 * Auth (per Metricool's API): every call sends the token in an `X-Mc-Auth`
 * header plus `userId` and `blogId` query parameters. `/admin/simpleProfiles`
 * lists the brands tied to the account, each with its blogId.
 *   https://static.metricool.com/API+DOC/API+English.pdf
 */

import { prisma } from "@/lib/prisma";

export function metricoolApiBase(): string {
  return (process.env.METRICOOL_API_BASE || "https://app.metricool.com/api").replace(/\/+$/, "");
}

export function metricoolUserId(): string {
  return process.env.METRICOOL_USER_ID || "";
}

/** True when the shared Metricool credential (token + user id) is set. */
export function isMetricoolConfigured(): boolean {
  return !!process.env.METRICOOL_USER_TOKEN && !!metricoolUserId();
}

export interface MetricoolBrand {
  blogId: string;
  label: string;
}

/** A Metricool GET with auth header + userId/blogId query params. */
export async function metricoolGet<T = unknown>(
  path: string,
  opts: { blogId?: string; params?: Record<string, string> } = {},
): Promise<T> {
  const token = process.env.METRICOOL_USER_TOKEN;
  const userId = metricoolUserId();
  if (!token || !userId) throw new Error("Metricool is not configured (METRICOOL_USER_TOKEN / METRICOOL_USER_ID).");

  const url = new URL(`${metricoolApiBase()}${path.startsWith("/") ? "" : "/"}${path}`);
  url.searchParams.set("userId", userId);
  if (opts.blogId) url.searchParams.set("blogId", opts.blogId);
  for (const [k, v] of Object.entries(opts.params ?? {})) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { "X-Mc-Auth": token, Accept: "application/json" },
    });
  } catch (err) {
    throw new Error(`Could not reach Metricool: ${err instanceof Error ? err.message : "network error"}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Metricool API ${res.status}: ${text.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** List the brands (accounts) tied to the Metricool login. */
export async function listMetricoolBrands(): Promise<MetricoolBrand[]> {
  // Some docs pass a blogId too; it is not required to enumerate brands.
  const data = await metricoolGet<unknown>("/admin/simpleProfiles");
  const arr = Array.isArray(data)
    ? data
    : Array.isArray((data as { data?: unknown[] })?.data)
      ? (data as { data: unknown[] }).data
      : [];
  return arr
    .map((b): MetricoolBrand | null => {
      if (!b || typeof b !== "object") return null;
      const rec = b as Record<string, unknown>;
      const blogId = rec.blogId ?? rec.id;
      if (blogId == null) return null;
      const label =
        (rec.label as string) ?? (rec.brand as string) ?? (rec.title as string) ?? (rec.name as string) ?? String(blogId);
      return { blogId: String(blogId), label: String(label) };
    })
    .filter((b): b is MetricoolBrand => b !== null);
}

/** The Metricool blogId assigned to a property, or null. */
export async function getPropertyBlogId(propertyCode: string): Promise<string | null> {
  const prop = await prisma.property.findUnique({ where: { code: propertyCode }, select: { id: true } });
  if (!prop) return null;
  const row = await prisma.weeklySetting.findFirst({
    where: { propertyId: prop.id, group: "metricool", key: "blogId" },
    select: { value: true },
  });
  if (!row || row.value == null) return null;
  const v = row.value;
  return typeof v === "string" ? v : String(v);
}
