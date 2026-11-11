import { SegmentRulesManager } from "@/components/sales/segment-rules-manager";
import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { getAccountSegmentOverview } from "@/lib/sales/account-segment-rules";

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

  const overview = await getAccountSegmentOverview();
  const admin = isAdmin(me);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Account Segments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Every booker seen in the reports, with its segment. Assignments apply to{" "}
          <strong>every property and period</strong> and take effect immediately — the Account Production tables
          re-segment without re-importing. Set an account to <em>Exclude</em> to drop junk rows (totals, vouchers), and
          watch the banner for new agents that need a decision.
        </p>
      </div>

      <SegmentRulesManager overview={overview} canEdit={admin} />
    </div>
  );
}
