/**
 * AI extraction for the Restaurant "Chope Reservations" upload. The report is
 * assembled from four separately-uploaded parts, so each compile is scoped to
 * one part for a clean read:
 *   - "traffic" → the funnel counts (fulfilled / cancelled / no-show / upcoming /
 *     walk-in, bookings + covers)
 *   - "revenue" → Chope revenue + its % of restaurant revenue
 *   - "sources" → Chope/Grab (platform) vs Restaurant channels (direct)
 *   - "daily"   → per-day online bookings by source
 * Scalar parts return the parsed fields; "daily" returns the day rows. Nothing
 * is written here.
 */

import {
  coerceChopeCore,
  normalizeChopeDaily,
  type NormalChopeDailyRow,
} from "@/lib/sales/chope-logic";
import { groqChat, isGroqConfigured, parseJsonLoose, type GroqImage } from "@/lib/weekly/groq";

export type ChopePart = "traffic" | "revenue" | "sources" | "daily";

const TRAFFIC_FIELDS = [
  "fulfilledBookings",
  "fulfilledCovers",
  "cancelledBookings",
  "cancelledCovers",
  "noShows",
  "noShowCovers",
  "upcomingBookings",
  "upcomingCovers",
  "walkinBookings",
  "walkinCovers",
] as const;
const REVENUE_FIELDS = ["revenue", "revenuePct"] as const;
const SOURCES_FIELDS = ["platformBookings", "platformCovers", "directBookings", "directCovers"] as const;

const TRAFFIC_SYSTEM = `You read a Chope "Traffic Summary" funnel and return STRICT JSON. Each status is a card with a BOOKINGS number and a COVERS number.
Return ONLY:
{"fulfilledBookings":<int>,"fulfilledCovers":<int>,"cancelledBookings":<int>,"cancelledCovers":<int>,"noShowBookings":<int>,"noShowCovers":<int>,"upcomingBookings":<int>,"upcomingCovers":<int>,"walkinBookings":<int>,"walkinCovers":<int>}
- Map each card: Fulfilled, Cancelled, No Show, Upcoming, Walk-ins. The first number under a card is Bookings, the second is Covers.
- Use 0 for a status shown as 0 or absent. Plain integers, no separators. Read only what is shown.`;

const REVENUE_SYSTEM = `You read a Chope revenue line and return STRICT JSON:
{"revenue":<int IDR>,"revenuePct":<number percent>}
- revenue = the Chope revenue amount in rupiah: "Rp9,805,025" or "Rp 9.805.025" -> 9805025.
- revenuePct = the percentage of restaurant revenue, as a plain number: "5.73%" -> 5.73. If no percentage is shown, omit revenuePct.
- Read only what is shown. Return ONLY the JSON.`;

const SOURCES_SYSTEM = `You read a Chope "Booking Sources" panel (two groups) and return STRICT JSON:
{"platformBookings":<int>,"platformCovers":<int>,"directBookings":<int>,"directCovers":<int>}
- platform = the "Chope/Grab" group (online platforms); direct = the "Restaurant Channels" group (restaurant website, social, newsletters).
- Each group shows a Bookings number and a Covers number. Plain integers. Read only what is shown. Return ONLY the JSON.`;

const DAILY_SYSTEM = `You read Chope "Traffic by Online Booking Sources" daily data and return STRICT JSON:
{"daily":[{"day":<int 1-31>,"platformBookings":<int>,"directBookings":<int>}],"fromChart":<true|false>}
- One object per day of the month. platformBookings = that day's Chope/Grab online bookings; directBookings = that day's Restaurant-Channels online bookings.
- Prefer a day-by-day TABLE; read every day, set "fromChart": false.
- If ONLY a bar chart is given (bars per day, one colour for Chope/Grab, another for Restaurant Channels), estimate each day's bar heights against the Y-axis gridlines and set "fromChart": true (approximate). Days with no bars are 0 or omitted.
- Plain integers. Never invent numbers. Return ONLY the JSON.`;

function configFor(part: ChopePart): { system: string; fields?: readonly string[] } {
  if (part === "traffic") return { system: TRAFFIC_SYSTEM, fields: TRAFFIC_FIELDS };
  if (part === "revenue") return { system: REVENUE_SYSTEM, fields: REVENUE_FIELDS };
  if (part === "sources") return { system: SOURCES_SYSTEM, fields: SOURCES_FIELDS };
  return { system: DAILY_SYSTEM };
}

export async function extractChope(
  input: { text?: string | null; image?: GroqImage | null; part: ChopePart },
): Promise<
  | { ok: true; values?: Record<string, number | null>; daily?: NormalChopeDailyRow[]; approximate?: boolean }
  | { ok: false; error: string }
> {
  if (!isGroqConfigured()) {
    return { ok: false, error: "AI extraction is not configured — set GROQ_API_KEY on the server." };
  }
  const text = input.text?.trim();
  if (!text && !input.image) {
    return { ok: false, error: "Paste the data or attach a screenshot/file first." };
  }
  const { system, fields } = configFor(input.part);
  const user = text
    ? `Extract the Chope ${input.part} figures from this data:\n\n${text}`
    : `Extract the Chope ${input.part} figures from the attached image.`;

  try {
    const raw = await groqChat({
      system,
      user,
      image: input.image ?? null,
      jsonMode: !input.image,
      temperature: 0,
      maxTokens: input.part === "daily" ? 3000 : 800,
    });
    const parsed = parseJsonLoose(raw) as Record<string, unknown>;

    if (input.part === "daily") {
      const dailyRaw = Array.isArray(parsed?.daily) ? (parsed.daily as never[]) : [];
      const { rows: daily } = normalizeChopeDaily(dailyRaw);
      if (daily.length === 0) {
        return { ok: false, error: "No daily rows read — paste/screenshot the day-by-day online-bookings table (not just the chart)." };
      }
      return { ok: true, daily, approximate: parsed?.fromChart === true };
    }

    // Scalar part: coerce, then return only this part's fields.
    const core = coerceChopeCore(parsed) as unknown as Record<string, number | null>;
    const values: Record<string, number | null> = {};
    for (const f of fields ?? []) values[f] = core[f] ?? null;
    const anyValue = Object.values(values).some((v) => v != null && v !== 0);
    if (!anyValue) {
      return { ok: false, error: `No ${input.part} figures could be read — check the screenshot and try again.` };
    }
    return { ok: true, values };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI extraction failed." };
  }
}
