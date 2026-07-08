import { PROPERTIES } from "@/lib/constants";

/**
 * Scaffold landing page. Intentionally not a dashboard — it confirms the design
 * system and layout are wired up. Real pages are built in later phases.
 */
export default function HomePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <span className="inline-flex items-center rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          Scaffold ready
        </span>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          BK Sales Dashboard
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Project scaffolding, design system, and data layer are in place.
          Dashboard pages and the report exporter are built in the next phases —
          see <code className="text-foreground">CLAUDE.md</code> for the roadmap.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {PROPERTIES.map((property) => (
          <div
            key={property.code}
            className="rounded-lg border border-border bg-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--brand-gold))]">
                {property.code}
              </span>
            </div>
            <h3 className="mt-2 text-base font-semibold text-foreground">
              {property.name}
            </h3>
            <p className="text-sm text-muted-foreground">
              {property.area} · {property.roomCount} rooms
            </p>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Restaurant</dt>
                <dd className="font-medium text-foreground">
                  {property.restaurant}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Spa</dt>
                <dd className="font-medium text-foreground">{property.spa}</dd>
              </div>
            </dl>
          </div>
        ))}
      </section>
    </div>
  );
}
