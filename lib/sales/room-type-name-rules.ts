/**
 * Saved room CODE→NAME rules (RoomTypeNameRule). Scoped per property and keyed
 * by the normalised room code. Read by the Rooms → Room Types fetcher to turn
 * VHP codes into readable names; managed from Admin → Room Type Names. Every DB
 * call is guarded so the dashboard still works if the migration hasn't been
 * applied yet (the rule set is just treated as empty → codes shown as-is).
 */

import { prisma } from "@/lib/prisma";
import { normalizeRoomCode } from "@/lib/sales/room-type-names";

export interface RoomNameRuleView {
  id: string;
  propertyCode: string;
  roomCode: string;
  roomName: string;
}

/** normalisedCode → display name for ONE property, for the read-time resolver.
 * Empty map if unavailable (migration not applied) → codes render as-is. */
export async function getRoomTypeNameMap(propertyCode: string): Promise<Map<string, string>> {
  const code = propertyCode.trim().toUpperCase();
  try {
    const rows = await prisma.roomTypeNameRule.findMany({
      where: { propertyCode: code },
      select: { roomCode: true, roomName: true },
    });
    return new Map(rows.map((r) => [normalizeRoomCode(r.roomCode), r.roomName]));
  } catch {
    return new Map();
  }
}

/** All rules (for the admin list), alphabetical by property then code. */
export async function listRoomTypeNameRules(): Promise<RoomNameRuleView[]> {
  try {
    const rows = await prisma.roomTypeNameRule.findMany({
      orderBy: [{ propertyCode: "asc" }, { roomCode: "asc" }],
      select: { id: true, propertyCode: true, roomCode: true, roomName: true },
    });
    return rows;
  } catch {
    return [];
  }
}

/** Add or update a mapping (idempotent on property + normalised code). */
export async function upsertRoomTypeNameRule(
  propertyCode: string,
  roomCode: string,
  roomName: string,
): Promise<{ ok: boolean; message: string }> {
  const prop = propertyCode.trim().toUpperCase();
  const code = normalizeRoomCode(roomCode);
  const name = roomName.trim();
  if (!prop) return { ok: false, message: "Property is required." };
  if (!code) return { ok: false, message: "Room code is required." };
  if (!name) return { ok: false, message: "Room name is required." };
  try {
    await prisma.roomTypeNameRule.upsert({
      where: { propertyCode_roomCode: { propertyCode: prop, roomCode: code } },
      create: { propertyCode: prop, roomCode: code, roomName: name },
      update: { roomName: name },
    });
    return { ok: true, message: `Saved ${code} → “${name}” (${prop}).` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Could not save the mapping." };
  }
}

/** Remove a mapping by id. */
export async function deleteRoomTypeNameRule(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    await prisma.roomTypeNameRule.delete({ where: { id } });
    return { ok: true, message: "Mapping removed." };
  } catch {
    return { ok: false, message: "Could not remove (already gone?)." };
  }
}

export interface RoomNameOverviewRow {
  propertyCode: string;
  /** Raw code as last seen in data, else the rule's code. */
  roomCode: string;
  /** Saved name, or "" when the code has no mapping yet. */
  roomName: string;
  hasRule: boolean;
  ruleId: string | null;
  /** The code appears in a report's room-type production. */
  inData: boolean;
  /** In data but with no saved name — needs a decision. */
  needsName: boolean;
}

export interface RoomTypeNameOverview {
  rows: RoomNameOverviewRow[];
  total: number;
  needsName: number;
}

/** Every (property, room code) seen across all reports, merged with the saved
 * mappings, so the admin can name each code and spot new/unnamed ones. */
export async function getRoomTypeNameOverview(): Promise<RoomTypeNameOverview> {
  let data: { code: string; property: string }[] = [];
  try {
    const rows = await prisma.roomTypeProduction.findMany({
      select: { roomTypeName: true, period: { select: { property: { select: { code: true } } } } },
    });
    data = rows.map((r) => ({ code: r.roomTypeName, property: r.period.property.code }));
  } catch {
    data = [];
  }

  const rules = await listRoomTypeNameRules();
  const ruleByKey = new Map(rules.map((r) => [`${r.propertyCode}|${normalizeRoomCode(r.roomCode)}`, r]));

  const map = new Map<string, RoomNameOverviewRow>();
  const keyOf = (prop: string, code: string) => `${prop}|${normalizeRoomCode(code)}`;

  // 1) Codes present in the reports.
  for (const d of data) {
    const prop = d.property.toUpperCase();
    const k = keyOf(prop, d.code);
    if (map.has(k)) {
      map.get(k)!.inData = true;
      continue;
    }
    const rule = ruleByKey.get(k);
    map.set(k, {
      propertyCode: prop,
      roomCode: d.code,
      roomName: rule?.roomName ?? "",
      hasRule: !!rule,
      ruleId: rule?.id ?? null,
      inData: true,
      needsName: !rule,
    });
  }

  // 2) Saved mappings whose code isn't in any report yet (still editable).
  for (const r of rules) {
    const k = keyOf(r.propertyCode, r.roomCode);
    if (map.has(k)) continue;
    map.set(k, {
      propertyCode: r.propertyCode,
      roomCode: r.roomCode,
      roomName: r.roomName,
      hasRule: true,
      ruleId: r.id,
      inData: false,
      needsName: false,
    });
  }

  const rows = [...map.values()].sort(
    (a, b) =>
      Number(b.needsName) - Number(a.needsName) ||
      a.propertyCode.localeCompare(b.propertyCode) ||
      a.roomCode.localeCompare(b.roomCode),
  );
  return { rows, total: rows.length, needsName: rows.filter((r) => r.needsName).length };
}
