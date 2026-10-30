import { SectionCard } from "@/components/dashboard/section-card";
import type { AgentRN, PropertyDetail } from "@/lib/daily/daily-detail-data";

const room = (n: number | null): string => (n == null ? "—" : String(n));

function prettyDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function AgentList({ rows, empty }: { rows: AgentRN[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1 text-sm">
      {rows.map((a, i) => (
        <li key={i} className="flex justify-between gap-3">
          <span className="text-foreground">{a.agent}</span>
          <span className="tabular-nums font-medium text-foreground">{a.rn} RN</span>
        </li>
      ))}
    </ul>
  );
}

function Total({ label, value, tone }: { label: string; value: number; tone: "pos" | "neg" }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone === "neg" ? "text-variance-negative" : "text-brand-teal"}`}>
        {value} <span className="text-base font-normal text-muted-foreground">RN</span>
      </p>
    </div>
  );
}

/**
 * Daily pickup + cancellation report and arrivals/departures for one property —
 * rendered below the Occupancy Pick-Up grid. Fed by the Reservation / Departure
 * feeds (+ existing cancellation data); empty-safe until those feeds send.
 */
export function ReservationDetail({ detail }: { detail: PropertyDetail }) {
  const otaTotal = detail.pickupOtaOffline.reduce((s, a) => s + a.rn, 0);
  const directTotal = detail.pickupDirect.reduce((s, a) => s + a.rn, 0);

  return (
    <>
      <SectionCard
        title="Pickup &amp; Cancellation"
        description={`Yesterday's booking movement · as of ${prettyDate(detail.refDate)}`}
      >
        <div className="grid gap-6 md:grid-cols-2">
          {/* Pickup */}
          <div className="space-y-4">
            <Total label="Total room-night pickup" value={detail.pickupTotal} tone="pos" />
            <div>
              <p className="mb-1 text-xs font-semibold text-foreground">OTA &amp; Offline Agent · {otaTotal} RN</p>
              <AgentList rows={detail.pickupOtaOffline} empty="No OTA / offline pickup." />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold text-foreground">Direct · {directTotal} RN</p>
              <AgentList rows={detail.pickupDirect} empty="No direct pickup." />
            </div>
          </div>

          {/* Cancellation */}
          <div className="space-y-4 md:border-l md:border-border md:pl-6">
            <Total label="Total room-night cancellation" value={detail.cancelTotal} tone="neg" />
            <div>
              <p className="mb-1 text-xs font-semibold text-foreground">By agent / source</p>
              <AgentList rows={detail.cancelByAgent} empty="No cancellations recorded." />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Arrivals &amp; Departures" description="Room movement around the report date">
        <div className="grid gap-4 sm:grid-cols-3">
          {detail.flow.length === 0 && (
            <p className="text-sm text-muted-foreground">No arrival/departure data yet.</p>
          )}
          {detail.flow.map((f, i) => {
            const title = f.heading === "Today" ? "Today" : f.heading === "Tomorrow" ? "Tomorrow" : f.heading;
            return (
              <div key={i} className="rounded-lg border border-border p-4">
                <p className="text-xs font-semibold text-brand-teal">{title}</p>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Arrival</span>
                  <span className="tabular-nums font-medium text-foreground">{room(f.arrival)} room</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Departure</span>
                  <span className="tabular-nums font-medium text-foreground">{room(f.departure)} room</span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </>
  );
}
