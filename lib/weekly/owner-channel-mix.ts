/**
 * Owner Overview "Channel Mix (Market Segmentation)" — the fixed three owner
 * channels and the rules that roll Section C · Weekly Agent Production up into
 * them. Kept dependency-free (no prisma, no React) so it is the single source
 * of truth for BOTH the client grid (components/weekly/sections/owner-overview)
 * and the server-side auto-sync (lib/weekly/owner-channel-mix-sync). Changing a
 * keyword here changes the classification everywhere at once.
 */

/** Fixed owner-facing channels, in report order. */
export const CHANNELS = [
  "OTA",
  "Direct Booking (Website/Walk In/Group Retreat)",
  "Offline Travel Agents",
] as const;
export type Channel = (typeof CHANNELS)[number];

/**
 * Bucket a Section C booking agent / source into one of the three owner
 * channels. Keyword-based (OTA checked first), with Offline Travel Agents as the
 * catch-all — the owner can still rename/adjust after syncing.
 */
export function classifyChannel(agent: string): Channel {
  const a = agent.toLowerCase();
  const OTA = ["booking", "expedia", "agoda", "traveloka", "tiket", "trip.com", "trip ", "airbnb", "hotels.com", "ctrip", "klook", "mg holiday", "hostelworld", "pegipegi", "aladin", "ota"];
  const DIRECT = ["website", "webs", "walk", "direct", "individual", "group retreat", "retreat", "fit"];
  // An explicit "direct" wins first: a source literally named "Direct Booking"
  // must land in Direct, not OTA (the "booking" OTA keyword would otherwise
  // catch it). Booking.com and friends have no "direct", so they still go OTA.
  if (a.includes("direct")) return "Direct Booking (Website/Walk In/Group Retreat)";
  if (OTA.some((k) => a.includes(k))) return "OTA";
  if (DIRECT.some((k) => a.includes(k))) return "Direct Booking (Website/Walk In/Group Retreat)";
  return "Offline Travel Agents";
}

/** One Section C agent row, reduced to just what the channel mix needs. */
export interface ChannelSegmentInput {
  label: string;
  rnSold: number | null;
  grossRevenue: number | null;
}

/** One derived channel row (numbers; the caller formats/persists as needed). */
export interface ChannelMixRow {
  label: Channel;
  rnSold: number;
  grossRevenue: number;
}

/**
 * Aggregate Section C agent rows into the fixed channels, in report order,
 * dropping channels that ended up with no rows. Pure — numbers in, numbers out.
 */
export function aggregateChannels(segments: ChannelSegmentInput[]): ChannelMixRow[] {
  const agg = new Map<Channel, { rn: number; rev: number }>();
  for (const s of segments) {
    const label = (s.label ?? "").trim();
    if (!label) continue;
    const ch = classifyChannel(label);
    const cur = agg.get(ch) ?? { rn: 0, rev: 0 };
    cur.rn += s.rnSold ?? 0;
    cur.rev += s.grossRevenue ?? 0;
    agg.set(ch, cur);
  }
  return CHANNELS.filter((ch) => agg.has(ch)).map((ch) => {
    const v = agg.get(ch)!;
    return { label: ch, rnSold: v.rn, grossRevenue: v.rev };
  });
}
