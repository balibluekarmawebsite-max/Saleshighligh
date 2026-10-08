/**
 * Per-section configuration for the AI-assisted Data Import.
 *
 * Each section declares the target columns the model must produce, plus a
 * short description of the shape and section-specific mapping rules. The AI
 * import endpoint turns an uploaded CSV / Excel / screenshot / pasted text
 * into rows matching `fields`; the apply action writes them (replace-all for
 * that one section). This is client-safe (no server-only imports) so the UI
 * can render the section grid and preview headers from it.
 */

import type { WeeklyEditorSectionKey } from "@/lib/weekly/editor-data";

export type AiFieldKind = "text" | "int" | "money" | "percent";

export interface AiImportField {
  key: string;
  label: string;
  kind: AiFieldKind;
}

export interface AiImportSection {
  id: string;
  title: string;
  description: string;
  /** Which editor completion flag marks this section Empty/filled. */
  completionKey: WeeklyEditorSectionKey;
  /** Needs a target year (channel room nights). */
  needsYear?: boolean;
  /** Needs a target platform (social metrics). */
  needsPlatform?: boolean;
  /** Offer a clean CSV template for this section (tabular sections). */
  csvTemplateId?: string;
  fields: AiImportField[];
  /** One line describing the row shape, for the prompt. */
  shape: string;
  /** Section-specific mapping rules, for the prompt. */
  rules: string;
}

const f = (key: string, label: string, kind: AiFieldKind): AiImportField => ({ key, label, kind });

const MONTH_FIELDS: AiImportField[] = [
  f("jan", "Jan", "int"), f("feb", "Feb", "int"), f("mar", "Mar", "int"),
  f("apr", "Apr", "int"), f("may", "May", "int"), f("jun", "Jun", "int"),
  f("jul", "Jul", "int"), f("aug", "Aug", "int"), f("sep", "Sep", "int"),
  f("oct", "Oct", "int"), f("nov", "Nov", "int"), f("dec", "Dec", "int"),
];

export const AI_IMPORT_SECTIONS: AiImportSection[] = [
  {
    id: "monthly",
    title: "B · Year to Date (Actual / Budget / LY)",
    description: "Per-month occupancy, ADR and revenue vs budget and last year. Occupancy is a percentage.",
    completionKey: "B",
    csvTemplateId: "monthly",
    fields: [
      f("month", "Month", "int"), f("rnSold", "RN Sold", "int"),
      f("occActual", "Occ Act %", "percent"), f("occBudget", "Occ Bud %", "percent"), f("occLy", "Occ LY %", "percent"),
      f("arrActual", "ARR Act", "money"), f("arrBudget", "ARR Bud", "money"), f("arrLy", "ARR LY", "money"),
      f("revActual", "Rev Act", "money"), f("revBudget", "Rev Bud", "money"), f("revLy", "Rev LY", "money"),
    ],
    shape: "one object per month that appears in the data",
    rules: "month is the month NUMBER 1–12 (January=1 … December=12). Occupancy values are percentages like 77.0 (0–100), NOT fractions. ARR and revenue are plain IDR numbers.",
  },
  {
    id: "segment",
    title: "C · Weekly Production by Market Segment",
    description: 'Best from VHP "Reservation By Creation Date" — grouped by segment.',
    completionKey: "C",
    csvTemplateId: "segment",
    fields: [f("label", "Segment", "text"), f("segmentGroup", "Group", "text"), f("rnSold", "RN Sold", "int"), f("grossRevenue", "Revenue", "money")],
    shape: "one object per market segment",
    rules: "label is the segment name. segmentGroup is optional (a broader grouping) — use null if unknown. Do not compute ARR or % (the app derives them).",
  },
  {
    id: "ratecode",
    title: "D · Rate Code / Promotion",
    description: "Room nights and revenue per rate code / promotion.",
    completionKey: "D",
    csvTemplateId: "ratecode",
    fields: [f("label", "Rate Code / Promotion", "text"), f("rnSold", "RN Sold", "int"), f("grossRevenue", "Revenue", "money")],
    shape: "one object per rate code or promotion",
    rules: "label is the rate code or promotion name. Do not compute ARR or % (the app derives them).",
  },
  {
    id: "channel",
    title: "E/F · Channel Inside (Room Nights)",
    description: "Room nights per source per month, for a year.",
    completionKey: "EF",
    needsYear: true,
    csvTemplateId: "channel",
    fields: [f("sourceLabel", "Source", "text"), ...MONTH_FIELDS],
    shape: "one object per booking source, with the 12 month columns of room nights",
    rules: "sourceLabel is the booking source (e.g. Booking.com, Expedia, WEB-ALARIC). jan…dec are integer room-night counts for each month (use 0 where empty). Only include rows for the requested year.",
  },
  {
    id: "sales",
    title: "G · Sales Activity",
    description: "Dated sales activities with a subject and notes.",
    completionKey: "G",
    fields: [f("dateLabel", "Date", "text"), f("title", "Subject", "text"), f("notes", "Notes / Remarks", "text")],
    shape: "one object per sales activity",
    rules: "dateLabel is a short date like '25 Sep 2026'. title is the subject (e.g. TELEMARKETING, a company name). notes holds the PIC / market / details — tidy the wording into clear professional English without inventing facts.",
  },
  {
    id: "ecommerce",
    title: "G2 · E-commerce Activities",
    description: "Dated e-commerce tasks with remarks.",
    completionKey: "G2",
    fields: [f("dateLabel", "Date", "text"), f("title", "Task", "text"), f("notes", "Notes / Remarks", "text")],
    shape: "one object per e-commerce task",
    rules: "dateLabel is a short date like '25 Sep 2026'. title is the task. notes holds the remarks — tidy the wording into clear professional English without inventing facts.",
  },
  {
    id: "social",
    title: "H · Social Media Insight",
    description: "Best from an Instagram / Meta insights screenshot — followers, reach, impressions, visits.",
    completionKey: "H",
    needsPlatform: true,
    fields: [f("metricKey", "Metric", "text"), f("lastWeek", "Last Week", "int"), f("thisWeek", "This Week", "int")],
    shape: "one object per metric",
    rules: "metricKey MUST be exactly one of: website_visit, profile_visit, account_reached, impression, followers. Map labels like 'Accounts reached'→account_reached, 'Impressions'→impression, 'Profile visits'→profile_visit, 'Website visits'→website_visit, 'Followers'→followers. lastWeek/thisWeek are integer counts.",
  },
  {
    id: "training",
    title: "I · Training",
    description: "Training sessions: date, topic, duration, trainer, participants.",
    completionKey: "I",
    fields: [f("dateLabel", "Date", "text"), f("topic", "Topic", "text"), f("duration", "Duration", "text"), f("trainer", "Trainer", "text"), f("participants", "Participants", "text")],
    shape: "one object per training session",
    rules: "dateLabel is a short date. duration is free text like '30 min' or '1 Hour'. participants is a comma-separated list.",
  },
  {
    id: "action_plans",
    title: "J · Next Week Action Plan",
    description: "Planned actions by category with start, deadline and remark.",
    completionKey: "J",
    fields: [f("category", "Category", "text"), f("plan", "Plan", "text"), f("startLabel", "Start", "text"), f("deadlineLabel", "Deadline", "text"), f("remark", "Subject / Remark", "text")],
    shape: "one object per planned action",
    rules: "category groups the plan (e.g. Offline Agent, Room Promotion, Marketing). plan is the action text — tidy into clear professional English. startLabel/deadlineLabel are short dates. remark is a short subject/label.",
  },
  {
    id: "owner_repeater",
    title: "Owner · Repeater Guest (per month)",
    description: "Repeater room nights and revenue per month.",
    completionKey: "OWNER",
    fields: [f("label", "Month", "text"), f("roomNights", "Room Nights", "int"), f("revenue", "Revenue", "money")],
    shape: "one object per month",
    rules: "label is a month like 'September 2026'. roomNights is an integer. revenue is a plain IDR number. Do not compute ADR (the app derives it).",
  },
  {
    id: "owner_channel_mix",
    title: "Owner · Channel Mix",
    description: "Room nights and revenue per source.",
    completionKey: "OWNER",
    fields: [f("label", "Source", "text"), f("rnSold", "RN Sold", "int"), f("grossRevenue", "Revenue", "money")],
    shape: "one object per source",
    rules: "label is the source (e.g. OTA, Direct Booking, Offline Travel Agents). Do not compute ARR or % (the app derives them).",
  },
];

export function getAiImportSection(id: string): AiImportSection | undefined {
  return AI_IMPORT_SECTIONS.find((s) => s.id === id);
}

/** Build the extraction system prompt for a section. */
export function buildImportSystemPrompt(section: AiImportSection, year?: number, platform?: string): string {
  const cols = section.fields.map((fl) => `"${fl.key}" (${fl.kind})`).join(", ");
  const context = [
    section.needsYear && year ? `The target year is ${year}.` : "",
    section.needsPlatform && platform ? `The target social platform is ${platform}.` : "",
  ].filter(Boolean).join(" ");

  return `You are a careful data-extraction assistant for a hotel's weekly Sales & Marketing report (Blue Karma Group, Bali; currency IDR).

Your job: read the INPUT the user provides — it may be a CSV, an Excel sheet dumped as text, pasted notes, or a screenshot image — and arrange it into rows for the report section "${section.title}". ${context}

Output ONLY a single JSON object of the form: {"rows": [ ... ]} — ${section.shape}.
Each row object must use EXACTLY these keys: ${cols}.

Rules:
- Use ONLY information present in the input. Never invent, estimate or pad numbers. If a value is missing, use null.
- Money values: output a plain number with no currency symbol and no thousand separators (e.g. 1598861618, not "Rp 1,598,861,618").
- Percent values: output the number only (e.g. 77.0), range 0–100, never a fraction.
- Integer values: whole numbers only.
- ${section.rules}
- Skip header rows, totals rows, and empty rows. Do not include a "Total" row.
- Return the JSON object only — no explanation, no markdown fences.`;
}
