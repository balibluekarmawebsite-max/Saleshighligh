import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { runScraperCheck } from "@/lib/monitor/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Scheduled scraper-health check. Verifies that each property's daily VHP feeds
 * arrived this morning; on a gap it records the miss, (optionally) queues a
 * re-pull for the office-PC scraper, and emails the team once per newly-detected
 * gap. Meant to run a couple of hours after the morning pulls (e.g. 09:00 WITA)
 * — see deploy/bk-scraper-check.timer.
 *
 * Auth mirrors the other crons: a bearer secret (CRON_SECRET) via
 * `Authorization: Bearer <secret>`, `x-cron-secret`, or `?key=`; or a signed-in
 * ADMIN for a manual browser trigger. Excluded from the auth middleware
 * (matcher skips /api/cron) so the scheduler isn't redirected to /login.
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  let ok = false;
  if (secret) {
    const auth = req.headers.get("authorization");
    const headerKey = req.headers.get("x-cron-secret");
    const queryKey = req.nextUrl.searchParams.get("key");
    ok = auth === `Bearer ${secret}` || headerKey === secret || queryKey === secret;
  }
  if (!ok) {
    const user = await getCurrentUser();
    ok = isAdmin(user);
  }
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: secret ? "Unauthorized." : "CRON_SECRET is not set — refusing to run." },
      { status: secret ? 401 : 503 },
    );
  }

  try {
    const r = await runScraperCheck({ trigger: "cron" });
    // Compact response — the full health snapshot is on the admin page.
    return NextResponse.json({
      ok: true,
      dateWita: r.dateWita,
      openGaps: r.openGaps,
      newGaps: r.newGaps,
      queued: r.recovered.filter((x) => x.jobId).length,
      autoRecover: r.autoRecover,
      emailSent: r.emailSent,
      emailError: r.emailError,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Scraper check failed." },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
