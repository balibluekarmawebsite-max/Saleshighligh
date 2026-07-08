import Link from "next/link";

import { ImportClient } from "@/components/admin/import-client";
import { getProperties } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

export default async function ImportPage() {
  const properties = await getProperties();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Import Monthly Data
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a filled workbook to validate and load a month of data. Need the
          template?{" "}
          <Link href="/admin/template" className="font-medium text-primary hover:underline">
            Download it here
          </Link>
          . Nothing is written until you confirm the preview.
        </p>
      </div>

      <ImportClient properties={properties} />
    </div>
  );
}
