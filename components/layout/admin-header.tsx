import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** Simple header for /admin pages (the context bar is dashboard-only). */
export function AdminHeader({ backHref }: { backHref: string }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-white px-4 sm:px-6">
      <h1 className="text-base font-semibold text-foreground">Admin</h1>
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to dashboard
      </Link>
    </header>
  );
}
