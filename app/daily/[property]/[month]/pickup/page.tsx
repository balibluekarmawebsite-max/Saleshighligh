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
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Occupancy Pick-Up</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {report.property.name} · {report.monthLabel}. Occupancy on hand tracked day by day — each row is a
          snapshot date, each column a stay month. The summary rows (Occ on Hand, Room Sold, ADR, Revenue) use
          the <span className="font-medium text-foreground">latest</span> reading; Increasement % and Average
          Pickup/day describe the movement.
        </p>
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
