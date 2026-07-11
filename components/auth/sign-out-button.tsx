"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton({ email }: { email: string | null }) {
  return (
    <div className="space-y-1">
      {email && <p className="truncate px-3 text-xs text-muted-foreground" title={email}>{email}</p>}
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/60 hover:text-accent-foreground"
      >
        <LogOut className="h-4 w-4" /> Sign out
      </button>
    </div>
  );
}
