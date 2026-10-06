import { LineChart } from "lucide-react";

import { SectionPlaceholder } from "@/components/weekly/section-placeholder";

export default function WeeklyTrendsPage() {
  return (
    <SectionPlaceholder
      icon={LineChart}
      title="Trends"
      description="Week-over-week comparison of the headline KPIs (occupancy, ADR, room revenue, room nights) with deltas, multi-week trend charts, a week-by-week table, and a cross-property portfolio snapshot."
      phase="Arrives in Phase 9"
    />
  );
}
