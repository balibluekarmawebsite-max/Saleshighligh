import type { NextRequest } from "next/server";

import { getCurrentUser, hasRole } from "@/lib/auth-helpers";
import { buildPropertyWorkbook } from "@/lib/daily/daily-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Bearer check for the import token (lets automation pull the file too). */
function tokenOk(req: NextRequest): boolean {
  const token = process.env.IMPORT_API_TOKEN;
  return Boolean(token && req.headers.get("authorization") === `Bearer ${token}`);
}

/**
 * Download the Daily Report Excel for one property:
 *   GET /api/daily/export?property=BKDS
 * One workbook, one tab per snapshot month (latest first, with yesterday's
 * detail), older months as history. Gated to a signed-in editor/admin (the
 * dashboard download button) or the import token (automation). Excluded from the
 * auth middleware, so it self-gates.
 */
export async function GET(req: NextRequest) {
  const code = (new URL(req.url).searchParams.get("property") ?? "").trim().toUpperCase();
  if (!code) return Response.json({ ok: false, error: "property query param is required." }, { status: 400 });

  if (!tokenOk(req)) {
    const user = await getCurrentUser();
    if (!hasRole(user, ["ADMIN", "EDITOR"])) {
      return Response.json({ ok: false, error: "Not authorized." }, { status: 403 });
    }
  }

  const wb = await buildPropertyWorkbook(code);
  if (!wb) return Response.json({ ok: false, error: `unknown property "${code}".` }, { status: 400 });

  return new Response(new Uint8Array(wb.buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_TYPE,
      "Content-Disposition": `attachment; filename="${wb.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
