import { RecipientsManager } from "@/components/daily/recipients-manager";
import { TestSendButton } from "@/components/daily/test-send-button";
import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { getEmailDeliveryStatus, type DeliveryStatus, type EmailDeliveryRow } from "@/lib/daily/email-monitor";

export const dynamic = "force-dynamic";

/** UTC ISO → Bali (WITA, UTC+8) wall-clock, e.g. "9 Nov 2026, 07:00 WITA". */
function witaStamp(iso: string): string {
  const w = new Date(new Date(iso).getTime() + 8 * 60 * 60 * 1000);
  const date = w.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const time = w.toISOString().slice(11, 16);
  return `${date}, ${time} WITA`;
}

const STATUS_STYLE: Record<DeliveryStatus, string> = {
  sent: "bg-variance-positive/10 text-variance-positive",
  failed: "bg-variance-negative/10 text-variance-negative",
  skipped: "bg-secondary text-muted-foreground",
  unknown: "bg-secondary text-muted-foreground",
};

function StatusBadge({ status }: { status: DeliveryStatus }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_STYLE[status]}`}>
      {status}
    </span>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default async function DailyEmailMonitorPage() {
  const me = await getCurrentUser();
  if (me?.role !== "ADMIN" && me?.role !== "EDITOR") {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-8 text-center">
        <p className="font-medium text-foreground">Restricted</p>
        <p className="mt-1 text-sm text-muted-foreground">Email delivery monitoring is visible to editors and admins.</p>
      </div>
    );
  }

  const status = await getEmailDeliveryStatus(60);
  const { config, history, lastAttempt, sentTodayWita } = status;
  const admin = isAdmin(me);

  // Headline banner state.
  const banner = !config.configured
    ? { tone: "warn", text: "Email is NOT configured — the 07:00 job runs but can't send. Set SMTP_* and DAILY_REPORT_TO in .env, then restart." }
    : lastAttempt?.status === "failed"
      ? { tone: "bad", text: `The last send FAILED: ${lastAttempt.error ?? "unknown error"}` }
      : sentTodayWita
        ? { tone: "good", text: "Today's Daily Report email was sent successfully." }
        : { tone: "warn", text: "No successful send recorded for today yet (the job runs at 07:00 WITA)." };

  const bannerClass =
    banner.tone === "good"
      ? "border-variance-positive/30 bg-variance-positive/10 text-variance-positive"
      : banner.tone === "bad"
        ? "border-variance-negative/30 bg-variance-negative/10 text-variance-negative"
        : "border-[hsl(var(--brand-gold))]/40 bg-[hsl(var(--brand-gold))]/10 text-foreground";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-foreground">Email Delivery</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Monitoring for the automated Daily Report email — whether the send succeeded each morning, and who it went to.
        </p>
      </div>

      <div className={`rounded-lg border p-4 text-sm font-medium ${bannerClass}`}>{banner.text}</div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Configuration */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Configuration</h3>
          <div className="mt-2 divide-y divide-border/60">
            <Row label="Status" value={config.configured ? <span className="text-variance-positive">Configured</span> : <span className="text-variance-negative">Not configured</span>} />
            <Row label="Schedule" value={config.schedule} />
            <Row label="SMTP host" value={config.host ?? "—"} />
            <Row label="Port" value={`${config.port}${config.secure ? " (TLS)" : ""}`} />
            <Row label="From" value={config.from ?? "—"} />
            <Row label="Cron secret" value={config.cronSecretSet ? "Set" : <span className="text-variance-negative">Missing</span>} />
          </div>
          <div className="mt-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Recipients</p>
            <RecipientsManager recipients={config.recipients} canEdit={admin} />
          </div>
        </div>

        {/* Send a test */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground">Verify delivery now</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send the Daily Report email immediately to confirm delivery works. It goes to the real recipients and is
            recorded in the history below.
          </p>
          <div className="mt-3">
            {!admin ? (
              <p className="text-sm text-muted-foreground">Only admins can send a test email.</p>
            ) : !config.configured ? (
              <p className="text-sm text-variance-negative">Configure SMTP + recipients first.</p>
            ) : (
              <TestSendButton recipients={config.recipients.map((r) => r.email)} />
            )}
          </div>
        </div>
      </div>

      {/* History */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Delivery history</h3>
        {history.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No send has run yet. The first record appears after the 07:00 WITA job (or a test send).
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/40 text-xs font-medium text-muted-foreground">
                  <th className="px-3 py-2 text-left">When</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Recipients</th>
                  <th className="px-3 py-2 text-right">Properties</th>
                  <th className="px-3 py-2 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h: EmailDeliveryRow) => (
                  <tr key={h.id} className="border-b border-border/60 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{witaStamp(h.at)}</td>
                    <td className="px-3 py-2"><StatusBadge status={h.status} /></td>
                    <td className="px-3 py-2 text-foreground">{h.to.length ? h.to.join(", ") : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-foreground">{h.properties ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {h.status === "failed"
                        ? <span className="text-variance-negative">{h.error ?? "failed"}</span>
                        : h.subject ?? (h.status === "skipped" ? "not configured" : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
