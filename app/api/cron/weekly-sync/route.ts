import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser, isAdmin } from "@/lib/auth-helpers";
import { isWeekId } from "@/lib/weekly/week";
import { runWeeklyAutoSync } from "@/lib/weekly/weekly-sync-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Scheduled weekly auto-sync. Pulls Metricool (+ ads) for every property's
 * current reporting week, creating the week's report if needed.
 *
 * Auth: a bearer secret (CRON_SECRET), sent by the scheduler as
 * `Authorization: Bearer <secret>` (Vercel Cron's convention), or via the
 * `x-cron-secret` header / `?key=` query for a plain VPS curl. A signed-in
 * ADMIN may also trigger it manually from the browser. Without CRON_SECRET set
 * the endpoint refuses to run (it writes data), unless auth is off entirely
 * (dev), where the synthetic admin applies.
 *
 * Optional `?week=yyyy-mm-dd` targets a specific reporting week (its Thursday
 * end) for a manual backfill; otherwise the current week is used.
 *
 * This route is excluded from the auth middleware (see middleware.ts) so the
 * scheduler's token request isn't redirected to /login.
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
    // Fall back to a signed-in admin (manual trigger / dev synthetic admin).
    const user = await getCurrentUser();
    ok = isAdmin(user);
  }
  if (!ok) {
    return NextResponse.json(
      {
        ok: false,
        error: secret
          ? "Unauthorized."
          : "CRON_SECRET is not set — refusing to run an unauthenticated sync.",
      },
      { status: secret ? 401 : 503 },
    );
  }

  const weekParam = req.nextUrl.searchParams.get("week");
  const week = weekParam && isWeekId(weekParam) ? weekParam : undefined;

  try {
    const result = await runWeeklyAutoSync({ week });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Auto-sync failed." },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
