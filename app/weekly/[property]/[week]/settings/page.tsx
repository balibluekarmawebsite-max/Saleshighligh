import { Check, Minus } from "lucide-react";

import { MetricoolSettings } from "@/components/weekly/metricool-settings";
import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { adsApiBase, isAdsSyncConfigured } from "@/lib/weekly/ads-sync";
import { groqModel, groqVisionModel, isGroqConfigured } from "@/lib/weekly/groq";
import { getPropertyBlogId, isMetricoolConfigured } from "@/lib/weekly/metricool";

export const dynamic = "force-dynamic";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function Flag({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-variance-positive">
      <Check className="h-4 w-4" /> Configured
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Minus className="h-4 w-4" /> Not set
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="mb-2 font-serif text-lg font-semibold text-foreground">{title}</h2>
      <div>{children}</div>
    </div>
  );
}

export default async function WeeklySettingsPage({
  params,
}: {
  params: { property: string; week: string };
}) {
  const user = await getCurrentUser();
  const admin = isAdmin(user);
  const authOn = !!process.env.AUTH_SECRET;
  const metricoolOn = isMetricoolConfigured();
  const metricoolBlogId = await getPropertyBlogId(params.property);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Weekly Reports configuration for {params.property}. Changes to users, roles and
          integrations are managed by an administrator.
        </p>
      </div>

      <Card title="Report">
        <Row label="Property" value={params.property} />
        <Row label="Report language" value="English" />
        <Row label="Currency" value="IDR (Indonesian Rupiah)" />
        <Row label="Reporting week" value="Friday → Thursday" />
        <Row label="Percentages" value="1 decimal place" />
      </Card>

      <Card title="AI (Groq)">
        <Row label="Status" value={<Flag on={isGroqConfigured()} />} />
        <Row label="Text model" value={<code className="text-xs">{groqModel()}</code>} />
        <Row label="Vision model" value={<code className="text-xs">{groqVisionModel()}</code>} />
        <Row label="Powers" value="Narrative draft · Rewrite · Shorten · Translate · Anomaly check · Data import · Screenshot summaries" />
        {!isGroqConfigured() && (
          <p className="pt-2 text-xs text-muted-foreground">
            Set <code>GROQ_API_KEY</code> on the server to enable AI. Override the models with{" "}
            <code>GROQ_MODEL</code> / <code>GROQ_VISION_MODEL</code>.
          </p>
        )}
      </Card>

      <Card title="Social Media (Metricool)">
        <Row label="Status" value={<Flag on={metricoolOn} />} />
        <Row label="This property's brand" value={metricoolBlogId ? <code className="text-xs">{metricoolBlogId}</code> : "—"} />
        <div className="pt-3">
          <MetricoolSettings
            property={params.property}
            currentBlogId={metricoolBlogId}
            configured={metricoolOn}
            isAdmin={admin}
          />
        </div>
      </Card>

      <Card title="Ads integration">
        <Row label="ROAS sync" value={<Flag on={isAdsSyncConfigured()} />} />
        <Row label="Dashboard" value={<code className="text-xs">{adsApiBase() || "—"}</code>} />
        {!isAdsSyncConfigured() && (
          <p className="pt-2 text-xs text-muted-foreground">
            Set <code>ADS_API_BASE</code> and <code>ADS_API_KEY</code> to pull ROAS automatically.
          </p>
        )}
      </Card>

      <Card title="Access">
        <Row label="Authentication" value={<Flag on={authOn} />} />
        <Row label="Your role" value={admin ? "Admin" : (user?.role ?? "—")} />
        <Row label="Signed in as" value={user?.email ?? "—"} />
        {!authOn && (
          <p className="pt-2 text-xs text-muted-foreground">
            Authentication is off — the app runs open as a synthetic admin until{" "}
            <code>AUTH_SECRET</code> is set.
          </p>
        )}
      </Card>
    </div>
  );
}
