/**
 * Pure renderer for the detailed daily reservation email — the long-form report
 * the team uses (pickup + cancellation by agent, on hand, arrivals/departures).
 * Data in, {subject, html, text} out; no I/O, so it's unit-testable.
 */

import type { AgentRN, DailyDetailData, FlowDay, PropertyDetail } from "@/lib/daily/daily-detail-data";

const TEAL = "#0F4C5C";
const GOLD = "#C9A227";
const MUTED = "#6b7280";
const TEAL_TINT = "#eaf1f3";
const BORDER = "#d9d9d9";

const pct = (n: number | null | undefined): string => (n == null ? "—" : `${n.toFixed(2)}%`);
const room = (n: number | null | undefined): string => (n == null ? "—" : String(n));
const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** "10-Nov-26" style label from an ISO date (matches the team's manual report). */
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(m ?? 1) - 1];
  return `${String(d).padStart(2, "0")}-${mon}-${String(y).slice(2)}`;
}

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
    L.push(`•  Departure: ${room(f.departure)} Room`);
    if (f.occupied != null) L.push(`•  Expected room occupied: ${room(f.occupied)} Room`);
    L.push("");
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
      const occLine = f.occupied != null ? `<br>• Expected room occupied: <strong>${room(f.occupied)}</strong> Room` : "";
      return `<div style="margin:8px 0 0;"><div style="font-weight:600;color:${TEAL};font-size:13px;">${title}</div>
        <div style="font-size:13px;color:#111827;">• Arrival: <strong>${room(f.arrival)}</strong> Room<br>• Departure: <strong>${room(f.departure)}</strong> Room${occLine}</div></div>`;
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

// ── Cross-property summary tables (the reservation team's manual format) ─────

interface AgentCell {
  pickup: number;
  cancel: number;
}
interface CrossAgentRow {
  display: string;
  byCode: Map<string, AgentCell>;
}

/** Merge pickup (OTA/Offline + Direct) and cancellation by agent across every
 * property, so one row lines an agent up across BKDS / BKDU / BKV. */
function crossAgentRows(data: DailyDetailData): CrossAgentRow[] {
  const display = new Map<string, string>();
  const rows = new Map<string, Map<string, AgentCell>>();
  const bump = (name: string, code: string, which: "pickup" | "cancel", rn: number) => {
    const key = name.trim().toUpperCase();
    if (!key) return;
    if (!display.has(key)) display.set(key, name.trim());
    const r = rows.get(key) ?? new Map<string, AgentCell>();
    const c = r.get(code) ?? { pickup: 0, cancel: 0 };
    c[which] += rn;
    r.set(code, c);
    rows.set(key, r);
  };
  for (const p of data.properties) {
    for (const a of [...p.pickupOtaOffline, ...p.pickupDirect]) bump(a.agent, p.code, "pickup", a.rn);
    for (const a of p.cancelByAgent) bump(a.agent, p.code, "cancel", a.rn);
  }
  const total = (key: string) =>
    [...(rows.get(key)?.values() ?? [])].reduce((s, c) => s + c.pickup + c.cancel, 0);
  return [...rows.keys()]
    .sort((a, b) => total(b) - total(a) || a.localeCompare(b))
    .map((key) => ({ display: display.get(key)!, byCode: rows.get(key)! }));
}

/** The distinct on-hand month labels, in first-seen order across properties. */
function onHandMonths(data: DailyDetailData): string[] {
  const out: string[] = [];
  for (const p of data.properties) for (const m of p.onHand) if (!out.includes(m.label)) out.push(m.label);
  return out;
}

const CELL = `border:1px solid ${BORDER};padding:5px 9px;text-align:center;font-size:12px;color:#111827;`;
const LEFT = `border:1px solid ${BORDER};padding:5px 9px;text-align:left;font-size:12px;color:#111827;`;
const HEAD = `border:1px solid ${BORDER};padding:5px 9px;font-size:12px;background:${TEAL};color:#fff;font-weight:700;`;
const SUB = `border:1px solid ${BORDER};padding:4px 9px;font-size:11px;background:${TEAL_TINT};color:${TEAL};font-weight:600;`;
const blank = (n: number): string => (n ? String(n) : "");

/** Table 1 — Pick up / Cancellation per property (Total + by agent). */
function pickCancelTableHtml(data: DailyDetailData, dateLabel: string): string {
  const props = data.properties;
  const head1 = props.map((p) => `<th colspan="2" style="${HEAD}text-align:center;">${p.code}</th>`).join("");
  const head2 = props.map(() => `<th style="${SUB}text-align:center;">Pick up</th><th style="${SUB}text-align:center;">Cancellation</th>`).join("");
  const totalRow = props
    .map((p) => `<td style="${CELL}font-weight:700;">${p.pickupTotal || 0}</td><td style="${CELL}font-weight:700;">${p.cancelTotal || 0}</td>`)
    .join("");
  const agentRows = crossAgentRows(data)
    .map((r) => {
      const cells = props
        .map((p) => {
          const c = r.byCode.get(p.code);
          return `<td style="${CELL}">${blank(c?.pickup ?? 0)}</td><td style="${CELL}">${blank(c?.cancel ?? 0)}</td>`;
        })
        .join("");
      return `<tr><td style="${LEFT}">${escapeHtml(r.display)}</td>${cells}</tr>`;
    })
    .join("");
  return `
  <table style="border-collapse:collapse;width:100%;margin:0 0 16px;">
    <thead>
      <tr><th rowspan="2" style="${HEAD}text-align:left;">${dateLabel}</th>${head1}</tr>
      <tr>${head2}</tr>
    </thead>
    <tbody>
      <tr><td style="${LEFT}font-weight:700;background:${TEAL_TINT};">Total</td>${totalRow}</tr>
      ${agentRows}
    </tbody>
  </table>`;
}

/** Table 2 — occupancy on hand (next months) per property. */
function onHandTableHtml(data: DailyDetailData): string {
  const props = data.properties;
  const months = onHandMonths(data);
  if (months.length === 0) return "";
  const pctOf = (code: string, label: string): number | null | undefined =>
    props.find((p) => p.code === code)?.onHand.find((m) => m.label === label)?.pct;
  const header = props.map((p) => `<th style="${HEAD}text-align:center;">${p.code}</th>`).join("");
  const rows = months
    .map((label) => {
      const cells = props.map((p) => `<td style="${CELL}">${pct(pctOf(p.code, label))}</td>`).join("");
      return `<tr><td style="${LEFT}font-weight:600;">${label} on hand</td>${cells}</tr>`;
    })
    .join("");
  return `
  <table style="border-collapse:collapse;width:100%;margin:0 0 16px;">
    <thead><tr><th style="${HEAD}text-align:left;">Occupancy on hand</th>${header}</tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/** Table 3 — Yesterday / Today / Tomorrow arrival · departure · expected occupied. */
function flowTablesHtml(data: DailyDetailData): string {
  const props = data.properties;
  const titles = ["Yesterday reservation", "Today reservation", "Tomorrow reservation"];
  const header = props.map((p) => `<th style="${HEAD}text-align:center;">${p.code}</th>`).join("");
  const metricRow = (i: number, label: string, get: (f: FlowDay | undefined) => number | null | undefined) => {
    const cells = props.map((p) => `<td style="${CELL}">${room(get(p.flow[i]))}</td>`).join("");
    return `<tr><td style="${LEFT}">${label}</td>${cells}</tr>`;
  };
  return titles
    .map(
      (title, i) => `
  <div style="margin:0 0 14px;">
    <div style="font-weight:700;color:${TEAL};font-size:13px;margin:0 0 4px;">${title}</div>
    <table style="border-collapse:collapse;width:100%;">
      <thead><tr><th style="${HEAD}text-align:left;">&nbsp;</th>${header}</tr></thead>
      <tbody>
        ${metricRow(i, "Arrival", (f) => f?.arrival ?? null)}
        ${metricRow(i, "Departure", (f) => f?.departure ?? null)}
        ${metricRow(i, "Expected room occupied", (f) => f?.occupied ?? null)}
      </tbody>
    </table>
  </div>`,
    )
    .join("");
}

/** The whole cross-property summary block (all three tables). */
function summaryTablesHtml(data: DailyDetailData, dateLabel: string): string {
  return `
  <div style="margin:0 0 24px;">
    <h2 style="margin:0 0 10px;font-size:16px;color:${TEAL};letter-spacing:.3px;">Reservation summary — all properties</h2>
    ${pickCancelTableHtml(data, dateLabel)}
    ${onHandTableHtml(data)}
    ${flowTablesHtml(data)}
  </div>`;
}

/** Compact text version of the cross-property summary. */
function summaryTablesText(data: DailyDetailData, dateLabel: string): string {
  const L: string[] = [`RESERVATION SUMMARY — ${dateLabel}`, ""];
  L.push("Pick up / Cancellation (RN):");
  for (const p of data.properties) L.push(`  ${p.code}: pick up ${p.pickupTotal || 0}, cancellation ${p.cancelTotal || 0}`);
  const months = onHandMonths(data);
  if (months.length) {
    L.push("", "Occupancy on hand:");
    for (const label of months) {
      const parts = data.properties.map((p) => `${p.code} ${pct(p.onHand.find((m) => m.label === label)?.pct)}`);
      L.push(`  ${label}: ${parts.join(", ")}`);
    }
  }
  const titles = ["Yesterday", "Today", "Tomorrow"];
  L.push("");
  titles.forEach((t, i) => {
    const a = data.properties.map((p) => `${p.code} ${room(p.flow[i]?.arrival ?? null)}`).join(", ");
    const d = data.properties.map((p) => `${p.code} ${room(p.flow[i]?.departure ?? null)}`).join(", ");
    const o = data.properties.map((p) => `${p.code} ${room(p.flow[i]?.occupied ?? null)}`).join(", ");
    L.push(`${t} reservation — Arrival: ${a} · Departure: ${d} · Expected room occupied: ${o}`);
  });
  return L.join("\n");
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

  const shortLabel = shortDate(data.refDate);
  const body = data.properties.length === 0
    ? `<p style="font-size:14px;color:#111827;">No reservation data has been recorded yet.</p>`
    : summaryTablesHtml(data, shortLabel) +
      `<h2 style="margin:22px 0 10px;font-size:16px;color:${TEAL};letter-spacing:.3px;border-top:1px solid #e5e7eb;padding-top:16px;">Per-property details</h2>` +
      data.properties.map(propertyHtml).join("");

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
    ...(data.properties.length === 0
      ? ["No reservation data has been recorded yet."]
      : [summaryTablesText(data, shortDate(data.refDate)), "", "PER-PROPERTY DETAILS", "", ...data.properties.map((p) => propertyText(p) + "\n")]),
    opts.dashboardUrl ? `Full report: ${opts.dashboardUrl}` : "",
  ].join("\n").trimEnd();

  return { subject, html, text };
}
