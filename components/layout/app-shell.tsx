import { MobileNav } from "@/components/layout/mobile-nav";
import { Sidebar } from "@/components/layout/sidebar";

/** The persistent shell: sidebar + a header slot + scrollable main content. */
export function AppShell({
  property,
  period,
  header,
  children,
}: {
  property: string;
  period: string;
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      <Sidebar property={property} period={period} />
      <div className="flex min-w-0 flex-1 flex-col">
        {header}
        <MobileNav property={property} period={period} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
