/**
 * Structured Restaurant Overview narrative: four labelled sections (Key
 * Challenges, Positive Highlights, Marketing Focus, Key Takeaway). Stored as
 * JSON in the RESTAURANT_OVERVIEW NarrativeContent row. Pure parse/serialize so
 * both the display and the editor read the same shape; legacy free-text content
 * is preserved in the Key Takeaway so nothing is lost on upgrade.
 */

export interface OverviewData {
  challenges: string[];
  highlights: string[];
  marketing: string[];
  takeaway: string;
}

export const OVERVIEW_SECTIONS = ["challenges", "highlights", "marketing", "takeaway"] as const;
export type OverviewSection = (typeof OVERVIEW_SECTIONS)[number];

export const OVERVIEW_SECTION_LABEL: Record<OverviewSection, string> = {
  challenges: "Key Challenges",
  highlights: "Positive Highlights",
  marketing: "Marketing Focus",
  takeaway: "Key Takeaway",
};

export const emptyOverview = (): OverviewData => ({ challenges: [], highlights: [], marketing: [], takeaway: "" });

const asLines = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  if (typeof v === "string") return bulletsFromText(v);
  return [];
};

/** Parse stored content into the four sections. JSON is the canonical form;
 * anything else (legacy 😊/☹️/💡 text) is kept verbatim in the takeaway. */
export function parseOverview(content: string | null | undefined): OverviewData {
  const raw = (content ?? "").trim();
  if (!raw) return emptyOverview();
  if (raw.startsWith("{")) {
    try {
      const o = JSON.parse(raw) as Record<string, unknown>;
      return {
        challenges: asLines(o.challenges),
        highlights: asLines(o.highlights),
        marketing: asLines(o.marketing),
        takeaway: String(o.takeaway ?? "").trim(),
      };
    } catch {
      // fall through to legacy handling
    }
  }
  return { ...emptyOverview(), takeaway: raw };
}

/** Serialize to the canonical JSON stored in NarrativeContent. */
export function serializeOverview(data: OverviewData): string {
  return JSON.stringify({
    challenges: data.challenges.map((s) => s.trim()).filter(Boolean),
    highlights: data.highlights.map((s) => s.trim()).filter(Boolean),
    marketing: data.marketing.map((s) => s.trim()).filter(Boolean),
    takeaway: data.takeaway.trim(),
  });
}

export function isOverviewEmpty(data: OverviewData): boolean {
  return (
    data.challenges.length === 0 &&
    data.highlights.length === 0 &&
    data.marketing.length === 0 &&
    data.takeaway.trim() === ""
  );
}

/** Split a textarea value (one bullet per line) into clean bullet strings,
 * tolerating leading "-", "•", "*" markers. */
export function bulletsFromText(text: string): string[] {
  return String(text ?? "")
    .split("\n")
    // Strip a leading bullet marker, but only treat "-"/"*" as a marker when a
    // space follows — so a minus sign attached to a figure ("-12%", "-Rp 50M",
    // "-8.40%") is kept, not read as a bullet and dropped.
    .map((l) => l.replace(/^\s*(?:[•‣·]+\s*|[-*]+(?=\s)\s*)/, "").trim())
    .filter(Boolean);
}

/** Join bullets back into a textarea value (one per line). */
export function bulletsToText(bullets: string[]): string {
  return bullets.join("\n");
}

/** Flatten the structured overview into readable text for the PPTX/PDF exports
 * (which render a narrative as a plain text block). */
export function overviewToText(data: OverviewData): string {
  const blocks: string[] = [];
  const bulletList = (label: string, items: string[]) => {
    if (items.length) blocks.push(`${label}:\n${items.map((b) => `• ${b}`).join("\n")}`);
  };
  bulletList("Key Challenges", data.challenges);
  bulletList("Positive Highlights", data.highlights);
  bulletList("Marketing Focus", data.marketing);
  if (data.takeaway.trim()) blocks.push(`Key Takeaway:\n${data.takeaway.trim()}`);
  return blocks.join("\n\n");
}

/** Convenience: parse stored content and flatten it to export text. */
export function overviewContentToText(content: string | null | undefined): string {
  return overviewToText(parseOverview(content));
}
