import * as XLSX from "xlsx";

import { DOMAINS, META_TAB, TEMPLATE_VERSION, type DomainSpec } from "./schema";

function metaSheet(propertyCode: string, period: string) {
  return XLSX.utils.aoa_to_sheet([
    ["key", "value"],
    ["property", propertyCode],
    ["period", period], // YYYY-MM
    ["templateVersion", TEMPLATE_VERSION],
  ]);
}

function domainSheet(domain: DomainSpec, dataRows: Record<string, unknown>[]) {
  const headers = domain.columns.map((c) => c.header);
  const body =
    dataRows.length > 0
      ? dataRows.map((row) => domain.columns.map((c) => row[c.key] ?? ""))
      : [domain.columns.map((c) => c.example)]; // example row when empty
  return XLSX.utils.aoa_to_sheet([headers, ...body]);
}

function assemble(
  propertyCode: string,
  period: string,
  dataByTab: Record<string, Record<string, unknown>[]>,
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const domain of DOMAINS) {
    const ws = domainSheet(domain, dataByTab[domain.tab] ?? []);
    XLSX.utils.book_append_sheet(wb, ws, domain.tab);
  }
  XLSX.utils.book_append_sheet(wb, metaSheet(propertyCode, period), META_TAB);

  // Hide the _meta tab.
  const metaIdx = wb.SheetNames.indexOf(META_TAB);
  wb.Workbook = { Sheets: wb.SheetNames.map((_, i) => ({ Hidden: i === metaIdx ? 1 : 0 })) };

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** A blank template (header + one example row per tab). */
export function generateTemplateBuffer(opts: {
  propertyCode: string;
  period: string; // YYYY-MM
}): Buffer {
  return assemble(opts.propertyCode, opts.period, {});
}

/** A filled workbook (real rows per tab), e.g. for the /samples example. */
export function generateFilledBuffer(opts: {
  propertyCode: string;
  period: string;
  dataByTab: Record<string, Record<string, unknown>[]>;
}): Buffer {
  return assemble(opts.propertyCode, opts.period, opts.dataByTab);
}

export function templateFileName(propertyCode: string, period: string): string {
  return `BK_SalesData_Template_${propertyCode}_${period}.xlsx`;
}
