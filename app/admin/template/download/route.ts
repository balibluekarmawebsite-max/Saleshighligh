import type { NextRequest } from "next/server";

import { generateTemplateBuffer, templateFileName } from "@/lib/import/template";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const property = (searchParams.get("property") ?? "").toUpperCase();
  const period = searchParams.get("period") ?? "";

  if (!property) {
    return new Response("Missing property", { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return new Response("Invalid period — expected YYYY-MM", { status: 400 });
  }

  const buffer = generateTemplateBuffer({ propertyCode: property, period });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${templateFileName(property, period)}"`,
      "Cache-Control": "no-store",
    },
  });
}
