import { describe, expect, it } from "vitest";

import {
  type Cell,
  cleanActivityRows,
  detectSalesActivityFromGrid,
  formatDateCell,
} from "./sales-activity-workbook";

// Mirrors the report's "Activities" sheet: a leading title row, a header row,
// then blocks — a Date + Subject row followed by Remarks-only rows (the Date
// cell is blank/merged on those). Column A is empty (as in the real export).
const SAMPLE: Cell[][] = [
  ["", "G. SALES ACTIVITY", "", ""],
  ["", "Date", "Subject", "Remarks"],
  ["", 46304, "TELEMARKETING", "Bali Prana"],
  ["", "", "", "PIC; Ibu Dayu"],
  ["", "", "", "Market Europe"],
  ["", 46307, "TELEMARKETING", "Eight Asia Travel"],
  ["", "", "", "PIC; Ibu Dewi"],
  ["", "", "", "Market Europe"],
];

describe("detectSalesActivityFromGrid", () => {
  it("groups each date block into one activity with joined remarks", () => {
    const rows = detectSalesActivityFromGrid(SAMPLE);
    expect(rows).toHaveLength(2);

    expect(rows[0]!.dateLabel).toBe("9 Oct 2026");
    expect(rows[0]!.title).toBe("TELEMARKETING");
    expect(rows[0]!.notes).toBe("Bali Prana\nPIC; Ibu Dayu\nMarket Europe");

    expect(rows[1]!.dateLabel).toBe("12 Oct 2026");
    expect(rows[1]!.notes).toBe("Eight Asia Travel\nPIC; Ibu Dewi\nMarket Europe");
  });

  it("handles a date repeated on every row (un-merged export) without splitting", () => {
    const grid: Cell[][] = [
      ["Date", "Subject", "Remarks"],
      [46304, "SALES CALL", "Agent A"],
      [46304, "", "note one"],
      [46304, "", "note two"],
      [46310, "SALES CALL", "Agent B"],
    ];
    const rows = detectSalesActivityFromGrid(grid);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.notes).toBe("Agent A\nnote one\nnote two");
    expect(rows[1]!.dateLabel).toBe("15 Oct 2026");
  });

  it("accepts date strings as well as Excel serials", () => {
    const grid: Cell[][] = [
      ["Date", "Activity", "Notes"],
      ["25 Sep 2026", "VISIT", "Site inspection"],
    ];
    const rows = detectSalesActivityFromGrid(grid);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dateLabel).toBe("25 Sep 2026");
    expect(rows[0]!.title).toBe("VISIT");
  });

  it("returns [] for an unrelated table (no Subject/Activity column)", () => {
    const plan: Cell[][] = [
      ["Start ( date )", "Deadline", "Remark"],
      [45345, 45352, "Telemarketing to our partner"],
    ];
    expect(detectSalesActivityFromGrid(plan)).toEqual([]);
  });
});

describe("formatDateCell", () => {
  it("converts Excel serials to a short label", () => {
    expect(formatDateCell(46304)).toBe("9 Oct 2026");
  });
  it("passes strings through trimmed", () => {
    expect(formatDateCell("  9 Oct 2026 ")).toBe("9 Oct 2026");
    expect(formatDateCell("")).toBe("");
  });
});

describe("cleanActivityRows", () => {
  it("drops rows with no subject and no notes", () => {
    const rows = cleanActivityRows([
      { dateLabel: "9 Oct 2026", title: "TELEMARKETING", notes: "x" },
      { dateLabel: "9 Oct 2026", title: "", notes: "" },
    ]);
    expect(rows).toHaveLength(1);
  });
});
