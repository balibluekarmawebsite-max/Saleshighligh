import { GuestCsvUploader } from "@/components/sales/guest-csv-uploader";
import { getCurrentUser } from "@/lib/auth-helpers";
import { PROPERTIES } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function GuestsImportPage() {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN" && me?.role !== "EDITOR") {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">Restricted</p>
        <p className="mt-1 text-sm text-muted-foreground">Guests Import is visible to editors and admins.</p>
      </div>
    );
  }

  const properties = PROPERTIES.map((p) => ({ code: p.code, name: p.name }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Guests — Arrival Guest Upload</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload VHP&rsquo;s <strong>Arrival Guest</strong> report CSV (exported as-is). The system reads each arrival,
          resolves nationalities (alpha-3 codes and all), and compiles <strong>Nationality &amp; Geography</strong> plus
          the <strong>Length of Stay</strong> distribution for the Guests page. The period and property are detected from
          the report header; preview first, then import. This is the same compile the scraper feed uses — handy for a
          one-off or a back-fill.
        </p>
      </div>

      <GuestCsvUploader properties={properties} />
    </div>
  );
}
