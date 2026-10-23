import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { sendDailyReport } from "@/lib/daily/daily-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Scheduled Daily Report email. Builds each property's occupancy-on-hand
 * summary from the latest pull and emails it to DAILY_REPORT_TO. Meant to run
 * each morning after the scraper's pulls land (e.g. 07:00 WITA) — see
 * deploy/bk-daily-report.timer.
 *
 * Auth mirrors the weekly-sync cron: a bearer secret (CRON_SECRET) via
 * `Authorization: Bearer <secret>`, `x-cron-secret`, or `?key=`; or a signed-in
 * ADMIN for a manual browser trigger. Excluded from the auth middleware
 * (middleware.ts matcher skips /api/cron) so the scheduler isn't redirected to
 * /login.
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
      {
        ok: false,
        error: secret ? "Unauthorized." : "CRON_SECRET is not set — refusing to run.",
      },
      { status: secret ? 401 : 503 },
    );
  }

  try {
    const result = await sendDailyReport();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Daily report failed." },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
