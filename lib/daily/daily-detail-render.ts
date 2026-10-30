/**
 * Pure renderer for the detailed daily reservation email — the long-form report
 * the team uses (pickup + cancellation by agent, on hand, arrivals/departures).
 * Data in, {subject, html, text} out; no I/O, so it's unit-testable.
 */

import type { AgentRN, DailyDetailData, PropertyDetail } from "@/lib/daily/daily-detail-data";

const TEAL = "#0F4C5C";
const GOLD = "#C9A227";
const MUTED = "#6b7280";

const pct = (n: number | null): string => (n == null ? "—" : `${n.toFixed(2)}%`);
const room = (n: number | null): string => (n == null ? "—" : String(n));

function prettyDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

const otaTotal = (p: PropertyDetail): number => p.pickupOtaOffline.reduce((s, a) => s + a.rn, 0);
const directTotal = (p: PropertyDetail): number => p.pickupDirect.reduce((s, a) => s + a.rn, 0);
const agentLines = (rows: AgentRN[]): string => rows.map((a) => `${a.agent} ${a.rn} RN`).join("\n");

// ── Plain text (mirrors the team's manual report) ───────────────────────────
function propertyText(p: PropertyDetail): string {
  const L: string[] = [];
  L.push(p.name.toUpperCase(), "");
  L.push(`Yesterday pick up with ${p.pickupTotal} RN`);
  L.push(`Yesterday cancellation with ${p.cancelTotal} RN`, "");
  for (const m of p.onHand) L.push(`${m.label} on hand at ${pct(m.pct)}`);
  if (p.roomCount) L.push(`The above on hand are based on ${p.roomCount} rooms`);
  L.push("");
  L.push(`Yesterday Pick up booking details OTA & Offline Agent : ${otaTotal(p)} RN`);
  if (p.pickupOtaOffline.length) L.push(agentLines(p.pickupOtaOffline));
  L.push("");
  L.push(`Direct Pick up booking details : ${directTotal(p)} RN`);
  if (p.pickupDirect.length) L.push(agentLines(p.pickupDirect));
  L.push("");
  L.push(`Yesterday cancellation booking details OTA, Offline Agent & Direct : ${p.cancelTotal} RN`);
  if (p.cancelByAgent.length) L.push(agentLines(p.cancelByAgent));
  L.push("");
  for (const f of p.flow) {
    L.push(f.heading === "Today" ? "Today Reservation" : f.heading === "Tomorrow" ? "Tomorrow Reservation" : f.heading);
    L.push(`•  Arrival: ${room(f.arrival)} Room`);
    L.push(`•  Departure: ${room(f.departure)} Room`, "");
  }
  return L.join("\n").trimEnd();
}

// ── HTML ────────────────────────────────────────────────────────────────────
function agentListHtml(rows: AgentRN[]): string {
  if (!rows.length) return "";
  return `<div style="margin:2px 0 0 12px;color:#111827;font-size:13px;">${rows
    .map((a) => `${a.agent} <strong>${a.rn} RN</strong>`)
    .join("<br>")}</div>`;
}

function propertyHtml(p: PropertyDetail): string {
  const onHand = p.onHand.map((m) => `${m.label} on hand at <strong>${pct(m.pct)}</strong>`).join("<br>");
  const flow = p.flow
    .map((f) => {
      const title = f.heading === "Today" ? "Today Reservation" : f.heading === "Tomorrow" ? "Tomorrow Reservation" : f.heading;
      return `<div style="margin:8px 0 0;"><div style="font-weight:600;color:${TEAL};font-size:13px;">${title}</div>
        <div style="font-size:13px;color:#111827;">• Arrival: <strong>${room(f.arrival)}</strong> Room<br>• Departure: <strong>${room(f.departure)}</strong> Room</div></div>`;
    })
    .join("");

  return `
  <div style="margin:0 0 26px;padding:16px 18px;border:1px solid #e5e7eb;border-radius:8px;background:#fff;">
    <h2 style="margin:0 0 10px;font-size:16px;color:${TEAL};letter-spacing:.3px;">${p.name.toUpperCase()}</h2>
    <p style="margin:0 0 10px;font-size:13px;color:#111827;">
      Yesterday pick up with <strong>${p.pickupTotal} RN</strong><br>
      Yesterday cancellation with <strong>${p.cancelTotal} RN</strong>
    </p>
    <p style="margin:0 0 10px;font-size:13px;color:#111827;">${onHand || "—"}${
      p.roomCount ? `<br><span style="color:${MUTED};font-size:12px;">The above on hand are based on ${p.roomCount} rooms</span>` : ""
    }</p>
    <p style="margin:0 0 2px;font-size:13px;color:#111827;"><strong>Pick up — OTA &amp; Offline Agent: ${otaTotal(p)} RN</strong></p>
    ${agentListHtml(p.pickupOtaOffline)}
    <p style="margin:10px 0 2px;font-size:13px;color:#111827;"><strong>Pick up — Direct: ${directTotal(p)} RN</strong></p>
    ${agentListHtml(p.pickupDirect)}
    <p style="margin:10px 0 2px;font-size:13px;color:#111827;"><strong>Cancellation — OTA, Offline &amp; Direct: ${p.cancelTotal} RN</strong></p>
    ${agentListHtml(p.cancelByAgent)}
    ${flow}
  </div>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderDailyDetailEmail(data: DailyDetailData, opts: { dashboardUrl?: string } = {}): RenderedEmail {
  const dateLabel = prettyDate(data.refDate);
  const subject = data.properties.length === 0
    ? "BK Daily Reservation Report — no data yet"
    : `BK Daily Reservation Report — ${dateLabel}`;

  const link = opts.dashboardUrl
    ? `<p style="margin:14px 0 0;font-size:13px;"><a href="${opts.dashboardUrl}" style="color:${TEAL};font-weight:600;">Open the full Daily Report →</a></p>`
    : "";

  const body = data.properties.length === 0
    ? `<p style="font-size:14px;color:#111827;">No reservation data has been recorded yet.</p>`
    : data.properties.map(propertyHtml).join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f7f8;">
  <div style="max-width:700px;margin:0 auto;padding:24px 16px;font-family:Inter,Arial,Helvetica,sans-serif;">
    <div style="border-top:3px solid ${GOLD};background:#fff;border-radius:8px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
      <h1 style="margin:0 0 2px;font-size:19px;color:${TEAL};">Blue Karma — Daily Reservation Report</h1>
      <p style="margin:0 0 14px;font-size:13px;color:${MUTED};">Dear Team, please find the update as of ${dateLabel} below.</p>
      ${body}
      ${link}
      <p style="margin:18px 0 0;font-size:11px;color:${MUTED};border-top:1px solid #e5e7eb;padding-top:12px;">Automated daily report · figures from the latest VHP pulls.</p>
    </div>
  </div>
</body></html>`;

  const text = [
    "Dear Team,",
    "",
    `Please kindly find the update of the reservation report as of ${dateLabel} as below:`,
    "",
    ...(data.properties.length === 0 ? ["No reservation data has been recorded yet."] : data.properties.map((p) => propertyText(p) + "\n")),
    opts.dashboardUrl ? `Full report: ${opts.dashboardUrl}` : "",
  ].join("\n").trimEnd();

  return { subject, html, text };
}
