import { notFound } from "next/navigation";

import { SectionCard } from "@/components/dashboard/section-card";
import { PickupGrid } from "@/components/daily/pickup-grid";
import { ReservationDetail } from "@/components/daily/reservation-detail";
import { getPropertyDetail } from "@/lib/daily/daily-detail-data";
import { getPickupReport } from "@/lib/daily/pickup-report-data";

export const dynamic = "force-dynamic";

export default async function PickupPage({ params }: { params: { property: string; month: string } }) {
  const report = await getPickupReport(params.property, params.month);
  if (!report) notFound();
  const detail = await getPropertyDetail(params.property);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Occupancy Pick-Up</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {report.property.name} · {report.monthLabel}. Occupancy on hand tracked day by day — each row is a
            snapshot date, each column a stay month. The summary rows (Occ on Hand, Room Sold, ADR, Revenue) use
            the <span className="font-medium text-foreground">latest</span> reading; Increasement % and Average
            Pickup/day describe the movement.
          </p>
        </div>
        <a
          href={`/api/daily/export?property=${encodeURIComponent(report.property.code)}`}
          className="shrink-0 rounded-md border border-brand-teal bg-brand-teal px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-teal/90"
        >
          Download Excel
        </a>
      </div>

      <SectionCard
        title="Occupancy movement"
        description={`${report.rows.length} day(s) recorded · ${report.columns.length} stay month(s) on the books`}
      >
        <PickupGrid report={report} />
      </SectionCard>

      {detail && <ReservationDetail detail={detail} />}
    </div>
  );
}
