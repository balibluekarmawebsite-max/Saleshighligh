import { describe, expect, it } from "vitest";

import { getPollerHeartbeat, recordPollerSeen } from "@/lib/weekly/poller-heartbeat";

describe("poller heartbeat", () => {
  it("records the most recent poll with a timestamp", () => {
    const before = Date.now();
    recordPollerSeen("WIN-PC01");
    const hb = getPollerHeartbeat();
    expect(hb).not.toBeNull();
    expect(hb!.worker).toBe("WIN-PC01");
    expect(hb!.at).toBeGreaterThanOrEqual(before);
    expect(hb!.at).toBeLessThanOrEqual(Date.now());
  });

  it("normalises an unknown / empty worker to null", () => {
    recordPollerSeen("unknown");
    expect(getPollerHeartbeat()!.worker).toBeNull();
    recordPollerSeen(null);
    expect(getPollerHeartbeat()!.worker).toBeNull();
  });
});
