import { CalendarRange } from "lucide-react";

import { SectionPlaceholder } from "@/components/weekly/section-placeholder";

export default function WeeklyReportsPage() {
  return (
    <SectionPlaceholder
      icon={CalendarRange}
      title="Weekly Reports"
      description="The list of weekly reports with their status (Draft → In progress → Ready for review → Approved → Exported), owner and last edited — plus the per-week report editor for sections A–J and the Owner Overview."
      phase="Arrives in Phase 4"
    />
  );
}
