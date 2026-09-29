import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { BACKUP_TABLES, backupPath, buildBackup, filesToPrune, okDetail, recordBackupRun } =
  await import("./export");

describe("backup", () => {
  it("names files by day under the year", () => {
    expect(backupPath(new Date("2026-09-28T03:00:00Z"))).toBe("2026/2026-09-28.json");
  });

  it("keeps the newest files and prunes the rest", () => {
    const files = [
      "2026/2026-09-21.json",
      "2025/2025-12-28.json",
      "2026/2026-09-28.json",
      "2026/2026-01-04.json",
    ];
    expect(filesToPrune(files, 2)).toEqual(["2026/2026-01-04.json", "2025/2025-12-28.json"]);
    expect(filesToPrune(files, 12)).toEqual([]);
  });

  it("reads every table from one snapshot call", async () => {
    const snap = Object.fromEntries(BACKUP_TABLES.map((t) => [t, [] as unknown[]]));
    snap.members = Array.from({ length: 1001 }, (_, i) => ({ id: i }));
    const rpc = vi.fn(async () => ({ data: snap, error: null }));
    const b = await buildBackup({ rpc } as never, new Date("2026-09-28T03:00:00Z"));
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith("backup_snapshot", { p_tables: [...BACKUP_TABLES] });
    expect(Object.keys(b.tables)).toEqual([...BACKUP_TABLES]);
    expect(b.counts.members).toBe(1001);
    expect(b.format).toBe("sondoq-backup/1");
  });

  it("fails when the snapshot misses a table or errors", async () => {
    const partial = { rpc: async () => ({ data: { members: [] }, error: null }) };
    await expect(buildBackup(partial as never)).rejects.toThrow("settings missing");
    const failing = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
    await expect(buildBackup(failing as never)).rejects.toThrow("boom");
  });

  it("records the run; a failure keeps the last good date", async () => {
    const upsert = vi.fn(async () => ({ error: null }));
    const sb = { from: () => ({ upsert }) };
    const now = new Date("2026-09-28T03:00:00Z");
    await recordBackupRun(sb as never, { ok: true, path: "2026/2026-09-28.json" }, now);
    expect(upsert).toHaveBeenLastCalledWith(
      {
        job: "backup",
        last_run_at: now.toISOString(),
        ok: true,
        detail: "2026/2026-09-28.json",
        last_ok_at: now.toISOString(),
      },
      { onConflict: "job" },
    );
    await recordBackupRun(sb as never, { ok: false, error: "x".repeat(500) }, now);
    const row = (upsert.mock.calls.at(-1) as unknown[])[0] as Record<string, unknown>;
    expect(row).not.toHaveProperty("last_ok_at");
    expect(row.ok).toBe(false);
    expect((row.detail as string).length).toBe(200);
  });

  it("adds the orphan proof report to the backup detail", () => {
    expect(okDetail("2026/2026-09-28.json")).toBe("2026/2026-09-28.json");
    expect(okDetail("f.json", { count: 0, paths: [] })).toBe("f.json");
    expect(okDetail("f.json", { count: 4, paths: ["p/1", "p/2", "p/3", "p/4"] })).toBe(
      "f.json · صور إثبات بلا سجل: 4 (p/1، p/2، p/3، …)",
    );
  });
});
