import { notFound } from "next/navigation";

import { getCurrentUser } from "@/lib/auth-helpers";
import { occPercent } from "@/lib/weekly/calculations";
import { getWeeklyExportData } from "@/lib/weekly/export-data";
import {
  EMPTY,
  formatIDRCompact,
  formatNumber,
  formatWeeklyPercent,
} from "@/lib/weekly/format";
import { screenshotCategoryLabel } from "@/lib/weekly/screenshots";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined) => (n == null ? EMPTY : formatIDRCompact(n));
const num = (n: number | null | undefined) => (n == null ? EMPTY : formatNumber(n));
const occ = (frac: number | null | undefined) =>
  frac == null ? EMPTY : formatWeeklyPercent(occPercent(frac));
const share = (n: number | null | undefined) =>
  n == null ? EMPTY : formatWeeklyPercent(n);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table>
      <thead>
        <tr>{head.map((h, i) => <th key={i} className={i === 0 ? "l" : "r"}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={ri}>{r.map((c, ci) => <td key={ci} className={ci === 0 ? "l" : "r"}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function Prose({ text }: { text: string | null | undefined }) {
  if (!text || !text.trim()) return <p className="muted">Not written for this week yet.</p>;
  return (
    <>
      {text.split("\n").filter(Boolean).map((p, i) => (
        <p key={i} className="prose">{p}</p>
      ))}
    </>
  );
}

export default async function WeeklyPrintPage({
  params,
  searchParams,
}: {
  params: { property: string; week: string };
  searchParams: { sections?: string; token?: string };
}) {
  // Self-gate: /print is excluded from middleware so the PDF exporter's headless
  // browser can reach it. When auth is on, require a session or the internal token.
  if (process.env.AUTH_SECRET) {
    const user = await getCurrentUser();
    if (!user && searchParams.token !== process.env.AUTH_SECRET) notFound();
  }

  const data = await getWeeklyExportData(params.property, params.week);
  if (!data) notFound();

  const sel = searchParams.sections ? new Set(searchParams.sections.split(",")) : null;
  const show = (id: string) => !sel || sel.has(id);

  const { property, week, overview, monthly, segments, rateCodes, channels, social, screenshots, departments } = data;
  const activities = [...departments.sales, ...departments.ecommerce];

  return (
    <div className="print-root">
      <style>{PRINT_CSS}</style>

      <div className="cover">
        <p className="kicker">WEEKLY SALES &amp; MARKETING REPORT</p>
        <h1>{property.name}</h1>
        <p className="sub">{week.label} · {property.area}</p>
        <p className="brand">Blue Karma Group · Week {week.weekNumber}, {week.year}</p>
      </div>

      {show("overview") && (
        <Section title="A · Sales &amp; Marketing Overview">
          {overview.map((b) => (
            <div key={b.key}>
              <h3>{b.heading}</h3>
              <Prose text={b.body} />
            </div>
          ))}
        </Section>
      )}

      {show("monthly") && monthly.rows.length > 0 && (
        <Section title="B · Monthly — Actual / Budget / Last Year">
          <Table
            head={["Month", "RN", "Occ A", "Occ B", "Occ LY", "ARR A", "ARR B", "Rev A", "Rev B", "Rev LY"]}
            rows={[
              ...monthly.rows.map((m) => [
                m.monthLabel, num(m.rnSold),
                occ(m.occActual), occ(m.occBudget), occ(m.occLy),
                money(m.arrActual), money(m.arrBudget),
                money(m.revActual), money(m.revBudget), money(m.revLy),
              ]),
              [
                "TOTAL / YTD", num(monthly.totals.rnSold), EMPTY, EMPTY, EMPTY,
                money(monthly.totals.arrActual), money(monthly.totals.arrBudget),
                money(monthly.totals.revActual), money(monthly.totals.revBudget), money(monthly.totals.revLy),
              ],
            ]}
          />
        </Section>
      )}

      {show("segments") && segments.rows.length > 0 && (
        <Section title="C · Weekly Market Segment">
          <Table
            head={["Segment", "Group", "Room Nights", "Revenue", "ARR", "Share"]}
            rows={[
              ...segments.rows.map((s) => [s.label, s.group ?? EMPTY, num(s.rnSold), money(s.grossRevenue), money(s.arr), share(s.share)]),
              ["TOTAL", "", num(segments.totals.rn), money(segments.totals.revenue), money(segments.totals.arr), share(100)],
            ]}
          />
        </Section>
      )}

      {show("ratecodes") && rateCodes.rows.length > 0 && (
        <Section title="D · Rate Codes &amp; Promotions">
          <Table
            head={["Rate Code", "Room Nights", "Revenue", "ARR", "Share"]}
            rows={[
              ...rateCodes.rows.map((r) => [r.label, num(r.rnSold), money(r.grossRevenue), money(r.arr), share(r.share)]),
              ["TOTAL", num(rateCodes.totals.rn), money(rateCodes.totals.revenue), money(rateCodes.totals.arr), share(100)],
            ]}
          />
        </Section>
      )}

      {show("channels") && channels.rows.length > 0 && (
        <Section title="E/F · Channel Production (Room Nights, YTD)">
          <Table
            head={["Source", "YTD Room Nights", "Share"]}
            rows={[
              ...channels.rows.map((c) => [c.source, num(c.ytd), share(c.share)]),
              ["TOTAL", num(channels.ytdTotal), share(100)],
            ]}
          />
        </Section>
      )}

      {show("social") && social.length > 0 && (
        <Section title="H · Social Media Insight">
          <Table
            head={["Platform", "Metric", "Last Week", "This Week", "Change", "Change %"]}
            rows={social.map((s) => [
              s.platform, s.metric, num(s.lastWeek), num(s.thisWeek),
              s.growth == null ? EMPTY : `${s.growth >= 0 ? "+" : ""}${num(s.growth)}`,
              s.growthPct == null ? EMPTY : `${s.growthPct >= 0 ? "+" : ""}${s.growthPct.toFixed(1)}%`,
            ])}
          />
        </Section>
      )}

      {show("screenshots") && screenshots.length > 0 && (
        <Section title="SM · Screenshots &amp; Summaries">
          {screenshots.map((s) => (
            <figure key={s.id} className="shot">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.imageUrl} alt={s.title || screenshotCategoryLabel(s.category)} />
              <figcaption>
                <strong>{screenshotCategoryLabel(s.category)}{s.title ? ` · ${s.title}` : ""}</strong>
                {s.summary ? <span className="prose"> {s.summary}</span> : null}
              </figcaption>
            </figure>
          ))}
        </Section>
      )}

      {show("departments") && (activities.length > 0 || departments.trainings.length > 0) && (
        <Section title="G · Department Activities &amp; Training">
          {activities.length > 0 && (
            <Table
              head={["Date", "Activity", "Notes"]}
              rows={activities.map((a) => [a.dateLabel ?? EMPTY, a.title ?? EMPTY, a.notes ?? EMPTY])}
            />
          )}
          {departments.trainings.length > 0 && (
            <>
              <h3>Learning &amp; Growth — Trainings</h3>
              <Table
                head={["Date", "Topic", "Duration", "Trainer", "Participants"]}
                rows={departments.trainings.map((t) => [t.dateLabel ?? EMPTY, t.topic, t.duration ?? EMPTY, t.trainer ?? EMPTY, t.participants ?? EMPTY])}
              />
            </>
          )}
        </Section>
      )}

      {show("plans") && departments.actionPlans.length > 0 && (
        <Section title="J · Next Week Action Plan">
          <Table
            head={["Category", "Plan", "Start", "Deadline", "Remark"]}
            rows={departments.actionPlans.map((a) => [a.category ?? EMPTY, a.plan, a.startLabel ?? EMPTY, a.deadlineLabel ?? EMPTY, a.remark ?? EMPTY])}
          />
        </Section>
      )}
    </div>
  );
}

const PRINT_CSS = `
  .print-root { color: #1F2937; font-family: Inter, Calibri, Arial, sans-serif; max-width: 1040px; margin: 0 auto; padding: 24px; }
  .cover { text-align: left; padding: 60px 0 40px; border-bottom: 3px solid #C9A227; margin-bottom: 24px; }
  .cover .kicker { color: #C9A227; font-weight: 700; letter-spacing: 2px; font-size: 14px; margin: 0 0 8px; }
  .cover h1 { color: #0F4C5C; font-size: 40px; margin: 0 0 8px; }
  .cover .sub { font-size: 16px; margin: 0; }
  .cover .brand { color: #6B7280; font-size: 12px; margin-top: 24px; }
  .section { break-inside: avoid; margin: 0 0 22px; }
  h2 { color: #0F4C5C; font-size: 18px; border-bottom: 2px solid #0F4C5C; padding-bottom: 4px; margin: 18px 0 10px; }
  h3 { color: #0F4C5C; font-size: 13px; margin: 12px 0 4px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 10px; font-size: 11px; }
  th { background: #0F4C5C; color: #fff; font-weight: 700; padding: 5px 8px; text-align: right; }
  th.l { text-align: left; }
  td { padding: 4px 8px; border-bottom: 1px solid #E5E7EB; text-align: right; }
  td.l { text-align: left; }
  p.prose { font-size: 12px; line-height: 1.5; margin: 4px 0; }
  p.muted { color: #6B7280; font-size: 11px; margin: 4px 0; }
  figure.shot { break-inside: avoid; margin: 8px 0 14px; }
  figure.shot img { max-width: 100%; max-height: 440px; border: 1px solid #E5E7EB; border-radius: 4px; display: block; }
  figure.shot figcaption { font-size: 12px; line-height: 1.5; margin-top: 4px; }
  figure.shot figcaption strong { color: #0F4C5C; }
  figure.shot figcaption .prose { color: #374151; }
  @media print {
    @page { size: A4 landscape; margin: 12mm; }
    .print-root { padding: 0; max-width: none; }
    .section { page-break-inside: avoid; }
  }
`;
