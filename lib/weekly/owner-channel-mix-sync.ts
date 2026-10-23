/**
 * Server-side auto-sync for Owner Overview "Channel Mix (Market Segmentation)".
 *
 * The channel mix is a derived view of Section C · Weekly Agent Production, so
 * it should refresh itself whenever Section C changes — instead of relying on
 * someone clicking "Sync from Agent Production" in the editor. This runs after
 * every Section C write (scraper push, AI/file import, manual grid save) and
 * on report create / weekly auto-sync, so the owner-facing mix always reflects
 * the latest agent production without any manual step.
 *
 * Idempotent and safe:
 *   - no Section C rows → no-op (leaves any carried-forward mix untouched);
 *   - a locked (approved/exported) report → no-op;
 *   - otherwise replace-all with the freshly derived channels.
 * Best-effort by contract (never throws) so it can't break the write that
 * triggered it — callers invoke it after their transaction commits.
 */

import { prisma } from "@/lib/prisma";
import { isLockedStatus } from "@/lib/weekly/editor-data";
import { aggregateChannels } from "@/lib/weekly/owner-channel-mix";

/**
 * Regenerate a report's Channel Mix from its current Section C rows.
 * Returns the number of channel rows written, or null when it was skipped
 * (report missing / locked / no Section C data). Never throws.
 */
export async function syncOwnerChannelMixIntoReport(reportId: string): Promise<number | null> {
  try {
    const report = await prisma.weeklyReport.findUnique({
      where: { id: reportId },
      select: {
        status: true,
        segmentProductions: {
          orderBy: { sortOrder: "asc" },
          select: { label: true, rnSold: true, grossRevenue: true },
        },
      },
    });
    if (!report) return null;
    if (isLockedStatus(report.status)) return null;
    if (report.segmentProductions.length === 0) return null; // nothing to derive from

    const channels = aggregateChannels(
      report.segmentProductions.map((s) => ({
        label: s.label,
        rnSold: s.rnSold,
        // Decimal → number; the mix only needs a plain total.
        grossRevenue: s.grossRevenue == null ? null : Number(s.grossRevenue),
      })),
    );
    if (channels.length === 0) return null; // all rows had blank labels

    await prisma.$transaction(async (tx) => {
      await tx.weeklyOwnerChannelMix.deleteMany({ where: { reportWeekId: reportId } });
      await tx.weeklyOwnerChannelMix.createMany({
        data: channels.map((c, i) => ({
          reportWeekId: reportId,
          label: c.label,
          rnSold: Math.round(c.rnSold),
          grossRevenue: c.grossRevenue,
          sortOrder: i,
        })),
      });
    });
    return channels.length;
  } catch {
    return null; // best-effort: must never break the triggering write
  }
}
