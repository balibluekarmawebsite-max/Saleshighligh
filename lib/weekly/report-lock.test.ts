import { describe, expect, it } from "vitest";

import { withReportLock } from "./report-lock";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withReportLock", () => {
  it("serializes work for the same key (no interleaving)", async () => {
    const order: string[] = [];
    const task = (id: string) => async () => {
      order.push(`${id}:start`);
      await delay(10);
      order.push(`${id}:end`);
      return id;
    };

    const [a, b] = await Promise.all([
      withReportLock("k", task("a")),
      withReportLock("k", task("b")),
    ]);

    expect(a).toBe("a");
    expect(b).toBe("b");
    // b must not begin until a has fully finished.
    expect(order).toEqual(["a:start", "a:end", "b:start", "b:end"]);
  });

  it("runs different keys concurrently", async () => {
    const order: string[] = [];
    const task = (id: string) => async () => {
      order.push(`${id}:start`);
      await delay(10);
      order.push(`${id}:end`);
    };

    await Promise.all([
      withReportLock("k1", task("a")),
      withReportLock("k2", task("b")),
    ]);

    // Both start before either ends → they overlapped.
    expect(order.slice(0, 2).sort()).toEqual(["a:start", "b:start"]);
  });

  it("does not wedge a key after a rejection", async () => {
    await expect(
      withReportLock("k", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const res = await withReportLock("k", async () => "ok");
    expect(res).toBe("ok");
  });
});
