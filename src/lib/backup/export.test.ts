import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { BACKUP_TABLES, backupPath, buildBackup, filesToPrune } = await import("./export");

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

  it("reads every table page by page", async () => {
    const big = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const range = vi.fn(async (from: number) => ({
      data: from === 0 ? big : [{ id: 1000 }],
      error: null,
    }));
    const sb = { from: () => ({ select: () => ({ range }) }) };
    const b = await buildBackup(sb as never, new Date("2026-09-28T03:00:00Z"));
    expect(Object.keys(b.tables)).toEqual([...BACKUP_TABLES]);
    expect(b.counts.members).toBe(1001);
    expect(b.format).toBe("sondoq-backup/1");
  });
});
