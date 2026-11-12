import { describe, expect, it } from "vitest";

import { normalizeMeal, normalizeMealRows, toInt } from "@/lib/sales/restaurant-sales-logic";

describe("toInt", () => {
  it("parses Indonesian thousands without inflating on a decimal comma", () => {
    expect(toInt("137.350.206")).toBe(137_350_206);
    expect(toInt("137.350.206,00")).toBe(137_350_206); // decimal comma, not ~100x
    expect(toInt("1.749")).toBe(1749); // dot thousands
    expect(toInt("892")).toBe(892);
    expect(toInt(153_980)).toBe(153_980);
    expect(toInt("")).toBeNull();
  });
});

describe("normalizeMeal", () => {
  it("maps meal names to the enum", () => {
    expect(normalizeMeal("Breakfast")).toBe("BREAKFAST");
    expect(normalizeMeal("LUNCH")).toBe("LUNCH");
    expect(normalizeMeal("Dinner")).toBe("DINNER");
    expect(normalizeMeal("TOTAL")).toBeNull();
  });
});

describe("normalizeMealRows", () => {
  it("parses the sample rows and drops TOTAL / unknown", () => {
    const r = normalizeMealRows([
      { meal: "Breakfast", coversActual: "892", coversBudget: "860", revenueActual: "137.350.206", revenueBudget: "150.568.274" },
      { meal: "Lunch", coversActual: 431, coversBudget: 669, revenueActual: 169_475_890, revenueBudget: 95_443_325 },
      { meal: "Dinner", coversActual: 426, coversBudget: 717, revenueActual: 134_016_088, revenueBudget: 234_596_112 },
      { meal: "TOTAL", coversActual: 1749, revenueActual: 440_842_184 },
    ]);
    expect(r.rows.map((x) => x.mealPeriod)).toEqual(["BREAKFAST", "LUNCH", "DINNER"]);
    expect(r.rows[0]).toEqual({ mealPeriod: "BREAKFAST", coversActual: 892, coversBudget: 860, revenueActual: 137_350_206, revenueBudget: 150_568_274 });
    expect(r.skipped).toBe(1); // TOTAL dropped
  });

  it("skips rows missing a meal or actual covers/revenue", () => {
    const r = normalizeMealRows([
      { meal: "Agoda", coversActual: 5, revenueActual: 10 },
      { meal: "Lunch", coversBudget: 100 },
      { meal: "Dinner", coversActual: 10, revenueActual: 1000 },
      null as never,
    ]);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.mealPeriod).toBe("DINNER");
    expect(r.skipped).toBe(3);
  });

  it("marks an absent budget as null (not 0) so a stored budget is preserved", () => {
    const r = normalizeMealRows([{ meal: "Breakfast", coversActual: 892, revenueActual: 137_350_206 }]);
    expect(r.rows[0]!.coversBudget).toBeNull();
    expect(r.rows[0]!.revenueBudget).toBeNull();
    // an explicit 0 is kept as 0 (a real budget of zero)
    const z = normalizeMealRows([{ meal: "Lunch", coversActual: 10, coversBudget: 0, revenueActual: 100, revenueBudget: 0 }]);
    expect(z.rows[0]!.coversBudget).toBe(0);
    expect(z.rows[0]!.revenueBudget).toBe(0);
  });
});
