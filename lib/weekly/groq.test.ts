import { describe, expect, it } from "vitest";

import { parseJsonLoose } from "@/lib/weekly/groq";

describe("parseJsonLoose", () => {
  it("parses plain JSON and code-fenced JSON", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips a reasoning <think> block before the JSON", () => {
    const out = parseJsonLoose('<think>let me read the chart…</think>\n{"points":[{"metric":"FLIGHT","year":2026,"month":1,"value":32}]}');
    expect(out).toEqual({ points: [{ metric: "FLIGHT", year: 2026, month: 1, value: 32 }] });
  });

  it("drops an unclosed trailing <think>", () => {
    expect(parseJsonLoose('{"a":1}\n<think>extra musing that never closed')).toEqual({ a: 1 });
  });

  it("salvages a response truncated mid-array", () => {
    // Output cut off after two complete points and a dangling partial third.
    const truncated =
      '{"destination":"Indonesia, Bali","points":[{"metric":"FLIGHT","year":2026,"month":1,"value":32},{"metric":"FLIGHT","year":2026,"month":2,"value":26},{"metric":"FLIGHT","year":2026,"mon';
    const out = parseJsonLoose(truncated) as { destination: string; points: unknown[] };
    expect(out.destination).toBe("Indonesia, Bali");
    expect(out.points).toHaveLength(2);
    expect(out.points[1]).toEqual({ metric: "FLIGHT", year: 2026, month: 2, value: 26 });
  });

  it("throws on genuinely unparseable text", () => {
    expect(() => parseJsonLoose("sorry, I couldn't read the chart")).toThrow();
  });
});
