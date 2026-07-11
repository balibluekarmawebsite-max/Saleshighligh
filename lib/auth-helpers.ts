import type { UserRole } from "@prisma/client";

import { auth } from "@/auth";

export interface AppUser {
  id: string;
  email: string | null;
  name: string | null;
  role: UserRole;
  assignedProperties: string[];
}

/**
 * The current user, or null. When AUTH_SECRET is unset (auth not yet
 * configured), returns a synthetic ADMIN so the app stays fully usable — role
 * enforcement switches on the moment auth is configured in production.
 */
export async function getCurrentUser(): Promise<AppUser | null> {
  if (!process.env.AUTH_SECRET) {
    return { id: "system", email: "system@local", name: "System", role: "ADMIN", assignedProperties: [] };
  }
  const session = await auth();
  if (!session?.user) return null;
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    name: session.user.name ?? null,
    role: session.user.role,
    assignedProperties: session.user.assignedProperties ?? [],
  };
}

export function hasRole(user: AppUser | null, roles: UserRole[]): boolean {
  return user != null && roles.includes(user.role);
}

export function isAdmin(user: AppUser | null): boolean {
  return user?.role === "ADMIN";
}

/** ADMIN may edit any property; EDITOR only its assigned ones; VIEWER none. */
export function canEditProperty(user: AppUser | null, propertyCode: string): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "EDITOR") return user.assignedProperties.includes(propertyCode);
  return false;
}

type Guard = { user: AppUser } | { response: Response };

/** Route-handler guard: returns the user, or a 401/403 Response to return early. */
export async function requireRole(roles: UserRole[]): Promise<Guard> {
  const user = await getCurrentUser();
  if (!user) return { response: Response.json({ error: "Not signed in." }, { status: 401 }) };
  if (!roles.includes(user.role)) return { response: Response.json({ error: "Insufficient permissions." }, { status: 403 }) };
  return { user };
}
