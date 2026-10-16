/**
 * Field specs for the Department Inputs editors (Sections G, G2, H, I, J).
 * Each spec drives the generic row editor: the field `key` is the Prisma column
 * name, so loading and saving map straight through. `primaryKey` is the field a
 * row must have to be kept (blank rows are dropped on save).
 */

export type FieldType = "text" | "textarea" | "number" | "select";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SectionField {
  key: string;
  label: string;
  type: FieldType;
  options?: SelectOption[];
}

export type WeeklySectionId =
  | "sales"
  | "ecommerce"
  | "social"
  | "trainings"
  | "action_plans";

export interface SectionSpec {
  id: WeeklySectionId;
  title: string;
  description: string;
  /** The field a row must have, or it's dropped on save. */
  primaryKey: string;
  fields: SectionField[];
}

const SOCIAL_METRICS: SelectOption[] = [
  { value: "followers", label: "Followers" },
  { value: "account_reached", label: "Accounts reached" },
  { value: "impression", label: "Impressions" },
  { value: "profile_visit", label: "Accounts Engaged" },
];

export const SECTION_SPECS: SectionSpec[] = [
  {
    id: "sales",
    title: "G · Sales Activity",
    description: "Sales calls, telemarketing and visits",
    primaryKey: "title",
    fields: [
      { key: "dateLabel", label: "Date", type: "text" },
      { key: "title", label: "Company / Subject", type: "text" },
      { key: "notes", label: "PIC / Market / Update", type: "textarea" },
    ],
  },
  {
    id: "ecommerce",
    title: "G2 · E-commerce Activities",
    description: "Tasks and remarks",
    primaryKey: "title",
    fields: [
      { key: "dateLabel", label: "Date", type: "text" },
      { key: "title", label: "Task", type: "text" },
      { key: "notes", label: "Remarks", type: "textarea" },
    ],
  },
  {
    id: "social",
    title: "H · Social Media Insight",
    description: "This week vs last week (growth is computed)",
    primaryKey: "metricKey",
    fields: [
      { key: "platform", label: "Platform", type: "text" },
      { key: "metricKey", label: "Metric", type: "select", options: SOCIAL_METRICS },
      { key: "lastWeek", label: "Last week", type: "number" },
      { key: "thisWeek", label: "This week", type: "number" },
    ],
  },
  {
    id: "trainings",
    title: "I · Training",
    description: "Sessions run this week",
    primaryKey: "topic",
    fields: [
      { key: "dateLabel", label: "Date", type: "text" },
      { key: "topic", label: "Topic", type: "text" },
      { key: "duration", label: "Duration", type: "text" },
      { key: "trainer", label: "Trainer", type: "text" },
      { key: "participants", label: "Participants", type: "textarea" },
    ],
  },
  // J · Next Week Action Plan is intentionally NOT a Department Inputs section:
  // it is edited only through the per-category Section J editor (PlansCards +
  // saveActionPlanCategory), so each category saves independently and one owner
  // can never overwrite another's category. A single flat editor here would
  // replace-all and defeat that guarantee.
];
