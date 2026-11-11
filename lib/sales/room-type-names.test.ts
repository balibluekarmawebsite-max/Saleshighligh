import { describe, expect, it } from "vitest";

import { normalizeRoomCode, resolveRoomTypeNames } from "@/lib/sales/room-type-names";

describe("normalizeRoomCode", () => {
  it("upper-cases and strips whitespace", () => {
    expect(normalizeRoomCode(" 1b pvl ")).toBe("1BPVL");
    expect(normalizeRoomCode("1bpvl")).toBe("1BPVL");
  });
});

describe("resolveRoomTypeNames", () => {
  const rows = [
    { code: "1BPVL", roomNights: 173, adr: 1_915_147, revenue: 331_320_463 },
    { code: "1BSUI", roomNights: 202, adr: 1_368_433, revenue: 276_423_549 },
  ];

  it("maps codes to names and keeps a lone row's stored ADR", () => {
    const map = new Map([
      ["1BPVL", "1 Bedroom Pool Villa"],
      ["1BSUI", "1 Bedroom Suite"],
    ]);
    const out = resolveRoomTypeNames(rows, map);
    expect(out[0]!.roomTypeName).toBe("1 Bedroom Pool Villa");
    expect(out[0]!.roomCode).toBe("1BPVL");
    expect(out[0]!.adr).toBe(1_915_147); // unchanged, not recomputed
    expect(out[1]!.roomTypeName).toBe("1 Bedroom Suite");
  });

  it("falls back to the raw code when there is no mapping", () => {
    const out = resolveRoomTypeNames(rows, new Map());
    expect(out[0]!.roomTypeName).toBe("1BPVL");
    expect(out[0]!.roomCode).toBe("1BPVL");
  });

  it("merges two codes that resolve to the same name and recomputes ADR", () => {
    const map = new Map([
      ["1BPVL", "1 Bedroom Pool Villa"],
      ["1BPVLCO", "1 Bedroom Pool Villa"], // complimentary variant → same name
    ]);
    const out = resolveRoomTypeNames(
      [
        { code: "1BPVL", roomNights: 173, adr: 1_915_147, revenue: 331_320_463 },
        { code: "1BPVLCO", roomNights: 7, adr: 0, revenue: 0 },
      ],
      map,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.roomNights).toBe(180);
    expect(out[0]!.revenue).toBe(331_320_463);
    expect(out[0]!.adr).toBe(331_320_463 / 180); // recomputed on merge
    expect(out[0]!.roomCode).toBe("1BPVL + 1BPVLCO");
  });

  it("sorts by revenue descending", () => {
    const out = resolveRoomTypeNames(
      [
        { code: "A", roomNights: 1, adr: 10, revenue: 10 },
        { code: "B", roomNights: 1, adr: 99, revenue: 99 },
      ],
      new Map(),
    );
    expect(out.map((r) => r.roomCode)).toEqual(["B", "A"]);
  });
});
