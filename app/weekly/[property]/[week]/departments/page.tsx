import { ClipboardList } from "lucide-react";

import { SectionPlaceholder } from "@/components/weekly/section-placeholder";

export default function WeeklyDepartmentsPage() {
  return (
    <SectionPlaceholder
      icon={ClipboardList}
      title="Department Inputs"
      description="Each department (Sales, E-commerce, Social Media, Graphic Design, Digital Marketing, Training) fills in its own sections — activity rows, notes and screenshots — with progress tracked so you can see who still has to submit."
      phase="Arrives in Phase 5"
    />
  );
}
