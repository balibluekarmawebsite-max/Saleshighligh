/** Deck section registry — client-safe (no server-only imports). */

export const DECK_SECTIONS = [
  { id: "summary", label: "Executive Summary" },
  { id: "factors", label: "External & Internal Factors" },
  { id: "rooms", label: "Rooms Analytics" },
  { id: "marketing", label: "Digital Ads & Reputation" },
  { id: "restaurant", label: "Restaurant" },
  { id: "spa", label: "Spa & Wellness" },
  { id: "market", label: "Market & Forecast" },
  { id: "plans", label: "Action Plans & PR" },
  { id: "social", label: "Social Media & Influencers" },
] as const;

export type DeckSectionId = (typeof DECK_SECTIONS)[number]["id"];

export const DEFAULT_SECTION_IDS: DeckSectionId[] = DECK_SECTIONS.map((s) => s.id);
