import { LayoutDashboard } from "lucide-react";

import { SectionPlaceholder } from "@/components/weekly/section-placeholder";

export default function WeeklyDashboardPage() {
  return (
    <SectionPlaceholder
      icon={LayoutDashboard}
      title="Weekly Dashboard"
      description="KPI cards and charts for the selected week — occupancy, ADR and room revenue vs budget and last year, weekly pick-up, cancellations and ROAS — plus a report-progress panel showing each section's status."
      phase="Fills with data in Phases 2–3"
    />
  );
}
