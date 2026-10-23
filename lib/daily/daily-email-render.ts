/**
 * Pure renderer for the Daily Report email: report data in, {subject, html,
 * text} out. No I/O, so it's unit-testable and the email stays in step with the
 * dashboard figures it was built from.
 */

import type { DailyEmailData, DailyEmailProperty } from "@/lib/daily/daily-email-data";
import { formatIDR } from "@/lib/format";

const TEAL = "#0F4C5C";
const GOLD = "#C9A227";
const BORDER = "#e5e7eb";
const MUTED = "#6b7280";

const pct = (n: number | null): string => (n == null ? "—" : `${n.toFixed(1)}%`);
const idr = (n: number | null): string => (n == null ? "—" : formatIDR(n));
const signed = (n: number | null): string => (n == null ? "—" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`);

/** A human date like "23 Oct 2026" from a yyyy-mm-dd (UTC-pinned). */
function prettyDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function propertyTableHtml(p: DailyEmailProperty): string {
  const th = `style="padding:6px 10px;text-align:right;font-size:12px;color:#fff;background:${TEAL};font-weight:600;"`;
  const thL = `style="padding:6px 10px;text-align:left;font-size:12px;color:#fff;background:${TEAL};font-weight:600;"`;
  const td = `style="padding:6px 10px;text-align:right;font-size:13px;color:#111827;border-bottom:1px solid ${BORDER};"`;
  const tdL = `style="padding:6px 10px;text-align:left;font-size:13px;color:#111827;border-bottom:1px solid ${BORDER};font-weight:600;"`;

  const rows = p.columns
    .map(
      (c) => `
      <tr>
        <td ${tdL}>${c.label}</td>
        <td ${td}>${pct(c.occOnHand)}</td>
        <td ${td}>${c.roomSold}</td>
        <td ${td}>${idr(c.revenue)}</td>
        <td ${td}>${idr(c.adr)}</td>
        <td ${td}>${signed(c.increasementPct)}</td>
      </tr>`,
    )
    .join("");

  return `
    <div style="margin:0 0 22px;">
      <h2 style="margin:0 0 2px;font-size:16px;color:${TEAL};">${p.code} · ${p.name}</h2>
      <p style="margin:0 0 8px;font-size:12px;color:${MUTED};">On the books as of ${prettyDate(p.asOf)} · ${p.monthLabel} →</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:640px;border:1px solid ${BORDER};border-radius:6px;overflow:hidden;">
        <thead>
          <tr>
            <th ${thL}>Month</th>
            <th ${th}>Occ on hand</th>
            <th ${th}>Room sold</th>
            <th ${th}>Revenue</th>
            <th ${th}>ADR</th>
            <th ${th}>Pickup</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderDailyEmail(data: DailyEmailData, opts: { dashboardUrl?: string } = {}): RenderedEmail {
  const dateLabel = prettyDate(data.asOf);
  const subject =
    data.properties.length === 0
      ? "BK Daily Occupancy Pick-Up — no data yet"
      : `BK Daily Occupancy Pick-Up — ${dateLabel}`;

  const link = opts.dashboardUrl
    ? `<p style="margin:18px 0 0;font-size:13px;"><a href="${opts.dashboardUrl}" style="color:${TEAL};font-weight:600;">Open the full Daily Report →</a></p>`
    : "";

  const body =
    data.properties.length === 0
      ? `<p style="font-size:14px;color:#111827;">No occupancy snapshots have been recorded yet. Once the morning pull lands, this report will show each property's occupancy on hand.</p>`
      : data.properties.map(propertyTableHtml).join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f8;">
  <div style="max-width:680px;margin:0 auto;padding:24px 16px;font-family:Inter,Arial,Helvetica,sans-serif;">
    <div style="border-top:3px solid ${GOLD};background:#fff;border-radius:8px;padding:22px 20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 2px;font-size:20px;color:${TEAL};">Blue Karma — Daily Occupancy Pick-Up</h1>
      <p style="margin:0 0 18px;font-size:13px;color:${MUTED};">Occupancy on the books as of ${dateLabel}</p>
      ${body}
      ${link}
      <p style="margin:22px 0 0;font-size:11px;color:${MUTED};border-top:1px solid ${BORDER};padding-top:12px;">Automated daily report · figures are computed from the latest VHP occupancy pull, never stored.</p>
    </div>
  </div>
</body></html>`;

  const text = renderText(data, dateLabel, opts.dashboardUrl);
  return { subject, html, text };
}

function renderText(data: DailyEmailData, dateLabel: string, dashboardUrl?: string): string {
  const lines: string[] = [`Blue Karma — Daily Occupancy Pick-Up`, `As of ${dateLabel}`, ""];
  if (data.properties.length === 0) {
    lines.push("No occupancy snapshots recorded yet.");
  } else {
    for (const p of data.properties) {
      lines.push(`${p.code} · ${p.name} (as of ${prettyDate(p.asOf)})`);
      for (const c of p.columns) {
        lines.push(
          `  ${c.label}: occ ${pct(c.occOnHand)}, sold ${c.roomSold}, rev ${idr(c.revenue)}, ADR ${idr(c.adr)}, pickup ${signed(c.increasementPct)}`,
        );
      }
      lines.push("");
    }
  }
  if (dashboardUrl) lines.push(`Open the full report: ${dashboardUrl}`);
  return lines.join("\n");
}
