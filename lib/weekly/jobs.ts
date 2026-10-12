/**
 * On-demand scrape job queue (VHP_JOBS_INTEGRATION).
 *
 * A dashboard user queues a job (createScrapeJob); the office-PC poller claims
 * the oldest queued job (claimNextJob — atomic, race-safe), scrapes + uploads
 * via /api/import, then reports the outcome (reportJobResult — idempotent). The
 * two scraper-facing endpoints are gated by a shared secret (checkJobsToken).
 */

import { prisma } from "@/lib/prisma";

/** Minutes a job may sit "running" before it's treated as crashed and re-queued. */
const STALE_LEASE_MS = 30 * 60 * 1000;

export type JobTokenCheck = { ok: true } | { ok: false; status: number; error: string };

/**
 * Validate the scraper's bearer token. Accepts VHP_JOBS_TOKEN (if set) or the
 * shared IMPORT_API_TOKEN (the default the scraper uses). Fails closed when
 * neither is configured.
 */
export function checkJobsToken(req: Request): JobTokenCheck {
  const importTok = process.env.IMPORT_API_TOKEN;
  const jobsTok = process.env.VHP_JOBS_TOKEN;
  if (!importTok && !jobsTok) {
    return { ok: false, status: 503, error: "No jobs token configured — set IMPORT_API_TOKEN or VHP_JOBS_TOKEN on the server." };
  }
  const auth = req.headers.get("authorization") ?? "";
  if ((jobsTok && auth === `Bearer ${jobsTok}`) || (importTok && auth === `Bearer ${importTok}`)) {
    return { ok: true };
  }
  return { ok: false, status: 401, error: "invalid token" };
}

const ymd = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);

export interface ClaimedJob {
  id: string;
  property: string;
  section: string;
  start: string | null;
  end: string | null;
  month: string | null;
  week_ending: string | null;
}

interface ClaimRow {
  id: string;
  property: string;
  section: string;
  startDate: Date | null;
  endDate: Date | null;
  month: string | null;
  weekEnding: Date | null;
}

/**
 * Atomically hand the oldest queued job to a worker and flip it to "running".
 * First re-queues any job stuck "running" past the stale lease (crashed worker).
 * Uses `FOR UPDATE SKIP LOCKED` so two concurrent claims can never grab the same
 * row. Returns null when the queue is empty.
 */
export async function claimNextJob(worker: string): Promise<ClaimedJob | null> {
  // Recover crashed leases: a job "running" with no result past the lease goes
  // back to the queue so a power cut / closed browser can't strand it forever.
  await prisma.scrapeJob.updateMany({
    where: { status: "running", claimedAt: { lt: new Date(Date.now() - STALE_LEASE_MS) } },
    data: { status: "queued", worker: null },
  });

  const rows = await prisma.$queryRaw<ClaimRow[]>`
    UPDATE "scrape_jobs"
    SET "status" = 'running', "worker" = ${worker}, "claimedAt" = now()
    WHERE "id" = (
      SELECT "id" FROM "scrape_jobs"
      WHERE "status" = 'queued'
      ORDER BY "requestedAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "property", "section", "startDate", "endDate", "month", "weekEnding";
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    property: r.property,
    section: r.section,
    start: ymd(r.startDate),
    end: ymd(r.endDate),
    month: r.month ?? null,
    week_ending: ymd(r.weekEnding),
  };
}

export type ResultOutcome = { ok: true } | { ok: false; status: number; error: string };

/**
 * Record a job's outcome. Idempotent: reporting a result for an
 * already-finished job is a no-op that still returns ok (the scraper may retry
 * if the first response was lost).
 */
export async function reportJobResult(
  id: string,
  input: { status: string; message?: string | null; written?: number | null; worker?: string | null },
): Promise<ResultOutcome> {
  const status = input.status === "done" ? "done" : input.status === "failed" ? "failed" : null;
  if (!status) return { ok: false, status: 400, error: 'status must be "done" or "failed".' };

  const job = await prisma.scrapeJob.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!job) return { ok: false, status: 404, error: "job not found." };

  // Already closed → no-op (idempotent retry).
  if (job.status === "done" || job.status === "failed") return { ok: true };

  await prisma.scrapeJob.update({
    where: { id },
    data: {
      status,
      message: input.message ?? null,
      written: typeof input.written === "number" ? input.written : null,
      worker: input.worker ?? undefined,
      finishedAt: new Date(),
    },
  });
  return { ok: true };
}

export const PROPERTY_CODES = ["BKDS", "BKDU", "BKV"] as const;

export interface CreateJobInput {
  property: string;
  section: string;
  start?: string | null;
  end?: string | null;
  month?: string | null;
  weekEnding?: string | null;
  requestedById?: string | null;
}

/** Validate + insert a queued job. Returns the new id, or a typed error. */
export async function createScrapeJob(
  input: CreateJobInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const property = input.property.trim().toUpperCase();
  const section = input.section.trim().toUpperCase();

  const prop = await prisma.property.findUnique({ where: { code: property }, select: { id: true } });
  if (!prop) return { ok: false, error: `Unknown property "${input.property}".` };
  if (section !== "B" && section !== "C") return { ok: false, error: 'Section must be "B" or "C".' };

  const date = (s: string | null | undefined): Date | null => {
    if (!s) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const d = new Date(`${s}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  let startDate: Date | null = null;
  let endDate: Date | null = null;
  let month: string | null = null;

  if (section === "C") {
    startDate = date(input.start);
    endDate = date(input.end);
    if (!startDate || !endDate) return { ok: false, error: "Section C needs a valid start and end date (YYYY-MM-DD)." };
    if (startDate > endDate) return { ok: false, error: "Start date must be on or before the end date." };
  } else {
    month = (input.month ?? "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) return { ok: false, error: "Section B needs a month (YYYY-MM)." };
  }

  const weekEnding = date(input.weekEnding);

  const job = await prisma.scrapeJob.create({
    data: {
      property,
      section,
      startDate,
      endDate,
      month,
      weekEnding,
      requestedById: input.requestedById ?? null,
      status: "queued",
    },
    select: { id: true },
  });
  return { ok: true, id: job.id };
}

export interface ScrapeJobView {
  id: string;
  property: string;
  section: string;
  period: string;
  status: string;
  message: string | null;
  written: number | null;
  worker: string | null;
  requestedAt: string;
  finishedAt: string | null;
}

/** Recent jobs for the UI list (newest first). */
export async function getRecentScrapeJobs(limit = 30): Promise<ScrapeJobView[]> {
  const jobs = await prisma.scrapeJob.findMany({
    orderBy: { requestedAt: "desc" },
    take: Math.min(Math.max(limit, 1), 100),
  });
  return jobs.map((j) => ({
    id: j.id,
    property: j.property,
    section: j.section,
    period:
      j.section === "C"
        ? `${ymd(j.startDate) ?? "?"} → ${ymd(j.endDate) ?? "?"}`
        : j.month ?? "?",
    status: j.status,
    message: j.message,
    written: j.written,
    worker: j.worker,
    requestedAt: j.requestedAt.toISOString(),
    finishedAt: j.finishedAt ? j.finishedAt.toISOString() : null,
  }));
}
