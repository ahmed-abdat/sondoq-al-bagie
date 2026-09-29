import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const runBackup = vi.fn();
const recordBackupRun = vi.fn(async () => {});
const orphans = { count: 2, paths: ["payments/a.jpg", "payments/b.jpg"] };
const findOrphanProofs = vi.fn(async () => orphans);
vi.mock("@/lib/backup/orphans", () => ({ findOrphanProofs: () => findOrphanProofs() }));
vi.mock("@/lib/backup/export", () => ({
  runBackup: (...a: unknown[]) => runBackup(...a),
  recordBackupRun: (...a: unknown[]) => recordBackupRun(...(a as [])),
}));
let admin: object | null = {};
vi.mock("@/lib/supabase/admin", () => ({ tryCreateAdminClient: () => admin }));
const { GET } = await import("./route");

const req = (auth?: string) =>
  new Request("http://localhost/api/backup", { headers: auth ? { authorization: auth } : {} });

afterEach(() => {
  vi.unstubAllEnvs();
  runBackup.mockReset();
  recordBackupRun.mockClear();
  admin = {};
});

describe("backup route", () => {
  it("refuses without the cron secret, even when none is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req())).status).toBe(401);
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(runBackup).not.toHaveBeenCalled();
  });

  it("needs the server secret key", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    admin = null;
    expect((await GET(req("Bearer s3cret"))).status).toBe(503);
  });

  it("runs the backup and reports counts, hiding errors", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    runBackup.mockResolvedValue({
      path: "2026/2026-09-28.json",
      counts: { members: 70 },
      pruned: 0,
    });
    expect(await (await GET(req("Bearer s3cret"))).json()).toMatchObject({
      ok: true,
      counts: { members: 70 },
    });
    runBackup.mockRejectedValue(new Error("secret detail"));
    const r = await GET(req("Bearer s3cret"));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ ok: false, error: "backup_failed" });
  });

  it("records the outcome for the committee, without failing on a record error", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    runBackup.mockResolvedValue({ path: "2026/2026-09-28.json", counts: {}, pruned: 0 });
    expect((await GET(req("Bearer s3cret"))).status).toBe(200);
    expect(recordBackupRun).toHaveBeenLastCalledWith(admin, {
      ok: true,
      path: "2026/2026-09-28.json",
      orphans,
    });
    runBackup.mockRejectedValue(new Error("upload failed"));
    recordBackupRun.mockRejectedValueOnce(new Error("db down"));
    expect((await GET(req("Bearer s3cret"))).status).toBe(500);
    expect(recordBackupRun).toHaveBeenLastCalledWith(admin, { ok: false, error: "upload failed" });
  });

  it("reports orphan proofs after a good backup (deletes nothing), and survives a failure there", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    runBackup.mockResolvedValue({ path: "2026/2026-09-28.json", counts: {}, pruned: 0 });
    expect(await (await GET(req("Bearer s3cret"))).json()).toMatchObject({
      ok: true,
      orphanProofs: 2,
    });
    findOrphanProofs.mockRejectedValueOnce(new Error("list failed"));
    expect(await (await GET(req("Bearer s3cret"))).json()).toMatchObject({
      ok: true,
      orphanProofs: null,
    });
  });
});
