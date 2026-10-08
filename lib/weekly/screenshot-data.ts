import { unstable_noStore as noStore } from "next/cache";

import { prisma } from "@/lib/prisma";

export interface WeeklyScreenshotRow {
  id: string;
  category: string;
  blockKey: string | null;
  title: string | null;
  imageUrl: string;
  summary: string | null;
  aiGenerated: boolean;
  sortOrder: number;
}

/** All screenshots for a property + week, in report order. */
export async function getWeeklyScreenshots(
  propertyCode: string,
  week: string,
): Promise<WeeklyScreenshotRow[]> {
  noStore();
  const rows = await prisma.weeklyScreenshot.findMany({
    where: {
      reportWeek: {
        property: { code: propertyCode },
        endDate: new Date(`${week}T00:00:00.000Z`),
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      category: true,
      blockKey: true,
      title: true,
      imageUrl: true,
      summary: true,
      aiGenerated: true,
      sortOrder: true,
    },
  });
  return rows;
}
