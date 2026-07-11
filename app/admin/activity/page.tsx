import { getAuditFeed } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

const ACTION_LABEL: Record<string, string> = {
  import: "Imported workbook",
  "narrative.save": "Saved narrative",
  "export.pptx": "Exported PPTX",
  "export.pdf": "Exported PDF",
  "export.group": "Exported Group pack",
  "period.final": "Marked FINAL",
  "period.reopen": "Re-opened period",
  "user.create": "Created user",
  "user.update": "Updated user",
};

export default async function ActivityPage() {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN" && me?.role !== "EDITOR") {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">Restricted</p>
        <p className="mt-1 text-sm text-muted-foreground">Activity is visible to editors and admins.</p>
      </div>
    );
  }

  const feed = await getAuditFeed(150);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Activity</h2>
        <p className="mt-1 text-sm text-muted-foreground">Imports, narrative edits, exports and final-lock events.</p>
      </div>

      {feed.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">No activity recorded yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-xs font-medium text-muted-foreground">
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">Who</th>
                <th className="px-3 py-2 text-left">Action</th>
                <th className="px-3 py-2 text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {feed.map((e) => (
                <tr key={e.id} className="border-b border-border/60">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{e.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-3 py-2 text-foreground">{e.userEmail ?? "system"}</td>
                  <td className="px-3 py-2 text-foreground">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="px-3 py-2 text-muted-foreground">{e.entity ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
