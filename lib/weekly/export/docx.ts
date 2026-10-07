import { readFile } from "node:fs/promises";

import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { occPercent } from "@/lib/weekly/calculations";
import { storagePath } from "@/lib/storage";
import { EMPTY, formatIDRCompact, formatNumber, formatWeeklyPercent } from "@/lib/weekly/format";
import type { WeeklyExportData } from "@/lib/weekly/export-data";
import { screenshotCategoryLabel } from "@/lib/weekly/screenshots";

/**
 * Build a native .docx of a weekly report from the shared export view model.
 * Mirrors the PDF layout: a cover block, the Section A narrative, then the
 * tabular sections — each value formatted with the weekly helpers so the Word
 * document reads exactly like the printed one.
 */

const TEAL = "0F4C5C";
const GOLD = "C9A227";
const MUTED = "6B7280";

const money = (n: number | null | undefined) => (n == null ? EMPTY : formatIDRCompact(n));
const num = (n: number | null | undefined) => (n == null ? EMPTY : formatNumber(n));
const occ = (frac: number | null | undefined) =>
  frac == null ? EMPTY : formatWeeklyPercent(occPercent(frac));
const share = (n: number | null | undefined) => (n == null ? EMPTY : formatWeeklyPercent(n));
const roas = (n: number | null | undefined) => (n == null ? EMPTY : `${n.toFixed(2)}×`);

function sectionHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 260, after: 120 },
    border: { bottom: { color: TEAL, space: 2, style: BorderStyle.SINGLE, size: 12 } },
    children: [new TextRun({ text, bold: true, color: TEAL, size: 26 })],
  });
}

function subHeading(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 140, after: 40 },
    children: [new TextRun({ text, bold: true, color: TEAL, size: 21 })],
  });
}

function prose(body: string | null | undefined): Paragraph[] {
  if (!body || !body.trim()) {
    return [new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "Not written for this week yet.", italics: true, color: MUTED, size: 20 })] })];
  }
  return body
    .split("\n")
    .filter((l) => l.trim())
    .map((line) => new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: line, size: 20 })] }));
}

function table(head: string[], rows: string[][]): Table {
  const cell = (text: string, i: number, header: boolean) =>
    new TableCell({
      shading: header ? { fill: TEAL } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [
        new Paragraph({
          alignment: i === 0 ? AlignmentType.LEFT : AlignmentType.RIGHT,
          children: [new TextRun({ text, bold: header, color: header ? "FFFFFF" : "1F2937", size: 16 })],
        }),
      ],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, i, false)) })),
    ],
  });
}

/** Read PNG/JPEG intrinsic dimensions from the file header (no image library). */
function imageSize(buf: Buffer): { width: number; height: number; type: "png" | "jpg" } | null {
  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  }
  // JPEG: scan for a Start-Of-Frame marker and read its dimensions.
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: "jpg" };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** Build an ImageRun for a stored screenshot, scaled to fit the page, or null. */
async function imageRunFor(imageKey: string): Promise<ImageRun | null> {
  let buf: Buffer;
  try {
    buf = await readFile(storagePath(imageKey));
  } catch {
    return null;
  }
  const size = imageSize(buf);
  if (!size) return null; // unsupported format (e.g. WebP) — caller falls back to summary only
  const MAX_W = 620;
  const MAX_H = 440;
  let scale = Math.min(1, MAX_W / size.width);
  if (size.height * scale > MAX_H) scale = MAX_H / size.height;
  return new ImageRun({
    type: size.type,
    data: buf,
    transformation: { width: Math.round(size.width * scale), height: Math.round(size.height * scale) },
  });
}

export async function buildWeeklyDocx(
  data: WeeklyExportData,
  sections: Set<string> | null,
): Promise<Buffer> {
  const show = (id: string) => !sections || sections.has(id);
  const { property, week, overview, monthly, segments, rateCodes, channels, social, ads, screenshots, departments } = data;
  const activities = [
    ...departments.sales.map((a) => ({ dept: "Sales", ...a })),
    ...departments.ecommerce.map((a) => ({ dept: "E-commerce", ...a })),
  ];

  const children: (Paragraph | Table)[] = [];

  // Cover
  children.push(
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: "WEEKLY SALES & MARKETING REPORT", bold: true, color: GOLD, size: 20 })] }),
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: property.name, bold: true, color: TEAL, size: 44 })] }),
    new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: `${week.label} · ${property.area}`, size: 24 })] }),
    new Paragraph({ spacing: { after: 200 }, border: { bottom: { color: GOLD, space: 4, style: BorderStyle.SINGLE, size: 18 } }, children: [new TextRun({ text: `Blue Karma Group · Week ${week.weekNumber}, ${week.year}`, color: MUTED, size: 18 })] }),
  );

  if (show("overview")) {
    children.push(sectionHeading("A · Sales & Marketing Overview"));
    for (const b of overview) {
      children.push(subHeading(b.heading));
      children.push(...prose(b.body));
    }
  }

  if (show("monthly") && monthly.rows.length > 0) {
    const t = monthly.totals;
    children.push(sectionHeading("B · Monthly — Actual / Budget / Last Year"));
    children.push(
      table(
        ["Month", "RN", "Occ A", "Occ B", "Occ LY", "ARR A", "ARR B", "Rev A", "Rev B", "Rev LY"],
        [
          ...monthly.rows.map((m) => [m.monthLabel, num(m.rnSold), occ(m.occActual), occ(m.occBudget), occ(m.occLy), money(m.arrActual), money(m.arrBudget), money(m.revActual), money(m.revBudget), money(m.revLy)]),
          ["TOTAL / YTD", num(t.rnSold), EMPTY, EMPTY, EMPTY, money(t.arrActual), money(t.arrBudget), money(t.revActual), money(t.revBudget), money(t.revLy)],
        ],
      ),
    );
  }

  if (show("segments") && segments.rows.length > 0) {
    const t = segments.totals;
    children.push(sectionHeading("C · Weekly Market Segment"));
    children.push(
      table(
        ["Segment", "Group", "Room Nights", "Revenue", "ARR", "Share"],
        [
          ...segments.rows.map((s) => [s.label, s.group ?? EMPTY, num(s.rnSold), money(s.grossRevenue), money(s.arr), share(s.share)]),
          ["TOTAL", "", num(t.rn), money(t.revenue), money(t.arr), share(100)],
        ],
      ),
    );
  }

  if (show("ratecodes") && rateCodes.rows.length > 0) {
    const t = rateCodes.totals;
    children.push(sectionHeading("D · Rate Codes & Promotions"));
    children.push(
      table(
        ["Rate Code", "Room Nights", "Revenue", "ARR", "Share"],
        [
          ...rateCodes.rows.map((r) => [r.label, num(r.rnSold), money(r.grossRevenue), money(r.arr), share(r.share)]),
          ["TOTAL", num(t.rn), money(t.revenue), money(t.arr), share(100)],
        ],
      ),
    );
  }

  if (show("channels") && channels.rows.length > 0) {
    children.push(sectionHeading("E/F · Channel Production (Room Nights, YTD)"));
    children.push(
      table(
        ["Source", "YTD Room Nights", "Share"],
        [
          ...channels.rows.map((c) => [c.source, num(c.ytd), share(c.share)]),
          ["TOTAL", num(channels.ytdTotal), share(100)],
        ],
      ),
    );
  }

  if (show("social") && social.length > 0) {
    children.push(sectionHeading("H · Social Media Insight"));
    children.push(
      table(
        ["Platform", "Metric", "Last Week", "This Week", "Change", "Change %"],
        social.map((s) => [
          s.platform, s.metric, num(s.lastWeek), num(s.thisWeek),
          s.growth == null ? EMPTY : `${s.growth >= 0 ? "+" : ""}${num(s.growth)}`,
          s.growthPct == null ? EMPTY : `${s.growthPct >= 0 ? "+" : ""}${s.growthPct.toFixed(1)}%`,
        ]),
      ),
    );
  }

  if (show("ads") && ads.hasData && ads.blended) {
    children.push(sectionHeading("Digital Ads & ROAS"));
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: `Blended ROAS ${roas(ads.blended.roas)} · Spend ${money(ads.blended.spend)} · Booked Revenue ${money(ads.blended.revenue)} · Conversions ${num(ads.blended.conversions)}${ads.window.from ? ` · Window ${ads.window.from} → ${ads.window.to}` : ""}`,
            size: 20,
          }),
        ],
      }),
    );
    if (ads.platforms.length > 0) {
      children.push(
        table(
          ["Platform", "Spend", "Conversions", "Attributed Rev", "ROAS", "CTR", "CPC"],
          ads.platforms.map((p) => [p.label, money(p.spend), num(p.conversions), money(p.revenue), roas(p.roas), share(p.ctr), money(p.cpc)]),
        ),
      );
    }
  }

  if (show("screenshots") && screenshots.length > 0) {
    children.push(sectionHeading("SM · Screenshots & Summaries"));
    for (const s of screenshots) {
      children.push(subHeading(`${screenshotCategoryLabel(s.category)}${s.title ? ` · ${s.title}` : ""}`));
      const img = await imageRunFor(s.imageKey);
      if (img) children.push(new Paragraph({ spacing: { after: 80 }, children: [img] }));
      children.push(...prose(s.summary));
    }
  }

  if (show("departments") && (activities.length > 0 || departments.trainings.length > 0)) {
    children.push(sectionHeading("G · Department Activities & Training"));
    if (activities.length > 0) {
      children.push(
        table(
          ["Department", "Date", "Activity", "Notes"],
          activities.map((a) => [a.dept, a.dateLabel ?? EMPTY, a.title ?? EMPTY, a.notes ?? EMPTY]),
        ),
      );
    }
    if (departments.trainings.length > 0) {
      children.push(subHeading("Learning & Growth — Trainings"));
      children.push(
        table(
          ["Date", "Topic", "Duration", "Trainer", "Participants"],
          departments.trainings.map((t) => [t.dateLabel ?? EMPTY, t.topic, t.duration ?? EMPTY, t.trainer ?? EMPTY, t.participants ?? EMPTY]),
        ),
      );
    }
  }

  if (show("plans") && departments.actionPlans.length > 0) {
    children.push(sectionHeading("J · Next Week Action Plan"));
    children.push(
      table(
        ["Category", "Plan", "Start", "Deadline", "Remark"],
        departments.actionPlans.map((a) => [a.category ?? EMPTY, a.plan, a.startLabel ?? EMPTY, a.deadlineLabel ?? EMPTY, a.remark ?? EMPTY]),
      ),
    );
  }

  const doc = new Document({
    creator: "BK Sales Dashboard",
    title: `${property.code} ${week.label} Weekly Report`,
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [
      {
        properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
        children,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
