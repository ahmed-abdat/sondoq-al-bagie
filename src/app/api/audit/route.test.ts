import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const runAuditJob = vi.fn();
const recordAuditRun = vi.fn(async () => {});
vi.mock("@/lib/data/audit-job", () => ({
  runAuditJob: (...a: unknown[]) => runAuditJob(...a),
  recordAuditRun: (...a: unknown[]) => recordAuditRun(...(a as [])),
}));
let admin: object | null = {};
vi.mock("@/lib/supabase/admin", () => ({ tryCreateAdminClient: () => admin }));
const { GET } = await import("./route");

const req = (auth?: string) =>
  new Request("http://localhost/api/audit", { headers: auth ? { authorization: auth } : {} });

afterEach(() => {
  vi.unstubAllEnvs();
  runAuditJob.mockReset();
  recordAuditRun.mockClear();
  admin = {};
});

describe("audit route", () => {
  it("refuses without the cron secret, even when none is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req())).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(runAuditJob).not.toHaveBeenCalled();
  });

  it("needs the server secret key", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    admin = null;
    expect((await GET(req("Bearer s3cret"))).status).toBe(503);
  });

  it("reports counts only, no check details", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    runAuditJob.mockResolvedValue({ ok: false, total: 28, failed: ["fund balance"] });
    expect(await (await GET(req("Bearer s3cret"))).json()).toEqual({
      ok: false,
      total: 28,
      failed: 1,
    });
  });

  it("an audit that cannot run is recorded and hidden", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    runAuditJob.mockRejectedValue(new Error("secret detail"));
    const r = await GET(req("Bearer s3cret"));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: "audit_failed" });
    expect(recordAuditRun).toHaveBeenCalledWith(admin, {
      ok: false,
      detail: "audit did not run: secret detail",
    });
  });
});
