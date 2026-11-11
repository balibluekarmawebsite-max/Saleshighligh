import { RoomTypeNamesManager } from "@/components/sales/room-type-names-manager";
import { PROPERTIES } from "@/lib/constants";
import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { getRoomTypeNameOverview } from "@/lib/sales/room-type-name-rules";

export const dynamic = "force-dynamic";

export default async function RoomTypeNamesPage() {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN" && me?.role !== "EDITOR") {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">Restricted</p>
        <p className="mt-1 text-sm text-muted-foreground">Room Type Names is visible to editors and admins.</p>
      </div>
    );
  }

  const overview = await getRoomTypeNameOverview();
  const admin = isAdmin(me);
  const properties = PROPERTIES.map((p) => ({ code: p.code, name: p.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Room Type Names</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          VHP pushes room <strong>codes</strong> (e.g. <code className="rounded bg-secondary px-1">1BPVL</code>). Give
          each code a readable name and the Room Types report shows the name instead — across{" "}
          <strong>every period</strong>, with no re-import. Two codes given the <em>same</em> name are combined into one
          row (handy for collapsing a complimentary rate code into its room). Watch the banner for new codes that need a
          name.
        </p>
      </div>

      <RoomTypeNamesManager overview={overview} properties={properties} canEdit={admin} />
    </div>
  );
}
