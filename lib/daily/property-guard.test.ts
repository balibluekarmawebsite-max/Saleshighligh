import { describe, expect, it } from "vitest";

import { wrongPropertyError, type SaleableSample } from "@/lib/daily/property-guard";

// October (31 days) saleable = rooms × 31: BKV 465, BKDS 558, BKDU 620.
const oct = (saleableRooms: number): SaleableSample[] => [
  { stayYear: 2026, stayMonth: 10, saleableRooms },
];

describe("wrongPropertyError", () => {
  it("passes a file posted under its own property", () => {
    expect(wrongPropertyError("BKDS", oct(558))).toBeNull(); // 18 rooms
    expect(wrongPropertyError("BKDU", oct(620))).toBeNull(); // 20 rooms
    expect(wrongPropertyError("BKV", oct(465))).toBeNull(); // 15 rooms
  });

  it("rejects a file posted under the wrong property and names the likely one", () => {
    const err = wrongPropertyError("BKDS", oct(620)); // a BKDU file posted as BKDS
    expect(err).toContain("BKDU");
    expect(err).toContain("BKDS");
    expect(wrongPropertyError("BKDU", oct(465))).toContain("BKV");
  });

  it("tolerates a one-room difference (odd OOO night)", () => {
    expect(wrongPropertyError("BKDS", oct(558 - 31))).toBeNull(); // 17 ≈ 18
  });

  it("uses whichever month has saleable (handles a leap/short February)", () => {
    // Feb 2027 = 28 days; BKDS 18 rooms → 504. Posted as BKDS → ok.
    expect(
      wrongPropertyError("BKDS", [{ stayYear: 2027, stayMonth: 2, saleableRooms: 504 }]),
    ).toBeNull();
  });

  it("skips when there's nothing to check", () => {
    expect(wrongPropertyError("BKDS", [])).toBeNull();
    expect(wrongPropertyError("BKDS", [{ stayYear: 2026, stayMonth: 10, saleableRooms: null }])).toBeNull();
    expect(wrongPropertyError("UNKNOWN", oct(620))).toBeNull();
  });
});
