"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { deleteRoomTypeNameRule, upsertRoomTypeNameRule } from "@/lib/sales/room-type-name-rules";

export interface RoomNameActionResult {
  ok: boolean;
  message: string;
}

/** Admin-only: add or update a room code→name mapping for a property. */
export async function saveRoomTypeNameAction(
  propertyCode: string,
  roomCode: string,
  roomName: string,
): Promise<RoomNameActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only admins can manage room names." };
  const r = await upsertRoomTypeNameRule(propertyCode, roomCode, roomName);
  if (r.ok) {
    revalidatePath("/admin/room-types");
    revalidatePath("/dashboard", "layout");
  }
  return r;
}

/** Admin-only: remove a mapping. */
export async function removeRoomTypeNameAction(id: string): Promise<RoomNameActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, message: "Only admins can manage room names." };
  const r = await deleteRoomTypeNameRule(id);
  if (r.ok) {
    revalidatePath("/admin/room-types");
    revalidatePath("/dashboard", "layout");
  }
  return r;
}
