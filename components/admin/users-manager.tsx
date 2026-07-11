"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Role = "ADMIN" | "EDITOR" | "VIEWER";

interface Row {
  id: string;
  name: string | null;
  email: string | null;
  role: Role;
  assignedProperties: string[];
}

const ROLES: Role[] = ["ADMIN", "EDITOR", "VIEWER"];

export function UsersManager({ users, properties }: { users: Row[]; properties: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create form
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("VIEWER");
  const [assigned, setAssigned] = useState<Set<string>>(new Set());

  async function api(method: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "Request failed.");
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    const ok = await api("POST", { email, name, password, role, assignedProperties: [...assigned] });
    if (ok) {
      setEmail("");
      setName("");
      setPassword("");
      setRole("VIEWER");
      setAssigned(new Set());
    }
  }

  return (
    <div className="space-y-6">
      {/* existing users */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-xs font-medium text-muted-foreground">
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Assigned properties (EDITOR)</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <UserRow key={u.id} user={u} properties={properties} onSave={(patch) => api("PATCH", { id: u.id, ...patch })} busy={busy} />
            ))}
          </tbody>
        </table>
      </div>

      {/* create user */}
      <div className="rounded-lg border border-border p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">Add a user</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <input placeholder="Temporary password (≥ 8 chars)" type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        {role === "EDITOR" && (
          <div className="mt-3 flex flex-wrap gap-3">
            {properties.map((code) => (
              <label key={code} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={assigned.has(code)} onChange={() => setAssigned((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; })} />
                {code}
              </label>
            ))}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-variance-negative">{error}</p>}
        <Button className="mt-3" size="sm" onClick={create} disabled={busy}>{busy ? "Saving…" : "Create user"}</Button>
      </div>
    </div>
  );
}

function UserRow({ user, properties, onSave, busy }: { user: Row; properties: string[]; onSave: (patch: { role: Role; assignedProperties: string[] }) => void; busy: boolean }) {
  const [role, setRole] = useState<Role>(user.role);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(user.assignedProperties));
  const dirty = role !== user.role || [...assigned].sort().join() !== [...user.assignedProperties].sort().join();

  return (
    <tr className="border-b border-border/60 align-top">
      <td className="px-3 py-2">
        <p className="font-medium text-foreground">{user.name ?? user.email}</p>
        <p className="text-xs text-muted-foreground">{user.email}</p>
      </td>
      <td className="px-3 py-2">
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </td>
      <td className="px-3 py-2">
        {role === "EDITOR" ? (
          <div className="flex flex-wrap gap-2">
            {properties.map((code) => (
              <label key={code} className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={assigned.has(code)} onChange={() => setAssigned((prev) => { const n = new Set(prev); if (n.has(code)) n.delete(code); else n.add(code); return n; })} />
                {code}
              </label>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{role === "ADMIN" ? "all properties" : "—"}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" variant="outline" className={cn(!dirty && "opacity-50")} disabled={!dirty || busy} onClick={() => onSave({ role, assignedProperties: [...assigned] })}>
          Save
        </Button>
      </td>
    </tr>
  );
}
