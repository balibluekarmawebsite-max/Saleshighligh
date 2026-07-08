import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getProperties } from "@/lib/dashboard-data";
import { DOMAINS } from "@/lib/import/schema";

export const dynamic = "force-dynamic";

export default async function TemplatePage() {
  const properties = await getProperties();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">
          Download Monthly Template
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate a fresh Excel workbook for a property and month. Fill one row
          per record under each tab, then upload it on the Import page.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generate template</CardTitle>
          <CardDescription>
            Produces <code>BK_SalesData_Template_[PROPERTY]_[YYYY-MM].xlsx</code>{" "}
            with {DOMAINS.length} tabs and an example row in each.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            action="/admin/template/download"
            method="get"
            className="flex flex-wrap items-end gap-4"
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Property</span>
              <select
                name="property"
                defaultValue={properties[0]?.code ?? "BKDS"}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                {properties.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-foreground">Month</span>
              <input
                type="month"
                name="period"
                defaultValue="2026-06"
                required
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              />
            </label>
            <Button type="submit" className="gap-2">
              <Download className="h-4 w-4" />
              Download
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tabs in the workbook</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {DOMAINS.map((d) => (
              <span
                key={d.tab}
                className="rounded-md border border-border bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground"
              >
                {d.tab}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
