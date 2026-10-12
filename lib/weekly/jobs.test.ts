import { afterEach, describe, expect, it } from "vitest";

import { checkJobsToken } from "@/lib/weekly/jobs";

const req = (auth?: string) =>
  new Request("http://x/api/jobs/claim", { method: "POST", headers: auth ? { authorization: auth } : {} });

const ENV = { ...process.env };
afterEach(() => {
  process.env.IMPORT_API_TOKEN = ENV.IMPORT_API_TOKEN;
  process.env.VHP_JOBS_TOKEN = ENV.VHP_JOBS_TOKEN;
});

describe("checkJobsToken", () => {
  it("fails closed (503) when neither token is configured", () => {
    delete process.env.IMPORT_API_TOKEN;
    delete process.env.VHP_JOBS_TOKEN;
    const r = checkJobsToken(req("Bearer anything"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });

  it("accepts the IMPORT_API_TOKEN", () => {
    process.env.IMPORT_API_TOKEN = "import-secret";
    delete process.env.VHP_JOBS_TOKEN;
    expect(checkJobsToken(req("Bearer import-secret")).ok).toBe(true);
  });

  it("accepts the VHP_JOBS_TOKEN when set", () => {
    process.env.IMPORT_API_TOKEN = "import-secret";
    process.env.VHP_JOBS_TOKEN = "jobs-secret";
    expect(checkJobsToken(req("Bearer jobs-secret")).ok).toBe(true);
    expect(checkJobsToken(req("Bearer import-secret")).ok).toBe(true); // either works
  });

  it("rejects a wrong or missing token (401)", () => {
    process.env.IMPORT_API_TOKEN = "import-secret";
    delete process.env.VHP_JOBS_TOKEN;
    const bad = checkJobsToken(req("Bearer nope"));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.status).toBe(401);
    const none = checkJobsToken(req());
    expect(none.ok).toBe(false);
    if (!none.ok) expect(none.status).toBe(401);
  });
});
