import { SegmentRulesManager } from "@/components/sales/segment-rules-manager";
import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { listSegmentRules } from "@/lib/sales/account-segment-rules";

export const dynamic = "force-dynamic";

export default async function AccountSegmentsPage() {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN" && me?.role !== "EDITOR") {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">Restricted</p>
        <p className="mt-1 text-sm text-muted-foreground">Account Segments is visible to editors and admins.</p>
      </div>
    );
  }

  const rules = await listSegmentRules();
  const admin = isAdmin(me);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Account Segments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Map a booker (by name) to a segment. Rules apply to <strong>every property and period</strong> and take effect
          immediately — the Account Production tables re-segment without re-importing. Set a rule to{" "}
          <em>Exclude</em> to drop junk rows (totals, vouchers) from the report.
        </p>
      </div>

      <SegmentRulesManager rules={rules} canEdit={admin} />
    </div>
  );
}
