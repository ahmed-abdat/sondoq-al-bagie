import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/push/send", () => ({ sendPush: vi.fn() }));
const { runAuditJob } = await import("./audit-job");

type Row = { check_name: string; ok: boolean | null; detail: string };

/** accuracy_audit rows, the committee's admins, and every job_runs upsert. */
function fakeAdmin(rows: Row[] | null, opts: { rpcError?: string; admins?: string[] } = {}) {
  const upserts: Record<string, unknown>[] = [];
  const filters: [string, unknown][] = [];
  const admin = {
    rpc: vi.fn(async () => ({
      data: opts.rpcError ? null : rows,
      error: opts.rpcError ? { message: opts.rpcError } : null,
    })),
    from: (table: string) => {
      if (table === "job_runs")
        return {
          upsert: async (row: Record<string, unknown>) => {
            upserts.push(row);
            return { error: null };
          },
        };
      const b = {
        select: () => b,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return b;
        },
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({
            data: (opts.admins ?? []).map((user_id) => ({ user_id })),
            error: null,
          }).then(ok),
      };
      return b;
    },
  };
  return { admin: admin as never, upserts, filters };
}

const now = new Date("2026-10-01T06:00:00Z");
const pass = (n: number): Row[] =>
  Array.from({ length: n }, (_, i) => ({ check_name: `c${i}`, ok: true, detail: "0" }));

describe("daily accuracy check", () => {
  it("all checks pass: recorded ok, nobody alerted", async () => {
    const { admin, upserts } = fakeAdmin(pass(28));
    const push = vi.fn();
    expect(await runAuditJob(admin, { push, now })).toEqual({ ok: true, total: 28, failed: [] });
    expect(upserts).toEqual([
      {
        job: "audit",
        last_run_at: now.toISOString(),
        ok: true,
        detail: "28/28",
        last_ok_at: now.toISOString(),
      },
    ]);
    expect(push).not.toHaveBeenCalled();
  });

  it("a failed or unknown check: recorded, the «مسؤول» accounts alerted", async () => {
    const rows = [...pass(26), { check_name: "fund balance", ok: false, detail: "x" }];
    rows.push({ check_name: "grid", ok: null, detail: "" });
    const { admin, upserts, filters } = fakeAdmin(rows, { admins: ["u1", "u2"] });
    const push = vi.fn();
    const r = await runAuditJob(admin, { push, now });
    expect(r).toEqual({ ok: false, total: 28, failed: ["fund balance", "grid"] });
    expect(upserts[0]).toMatchObject({
      job: "audit",
      ok: false,
      detail: "2/28 failed: fund balance; grid",
    });
    expect(upserts[0]).not.toHaveProperty("last_ok_at");
    expect(filters).toEqual([
      ["active", true],
      ["role", "admin"],
    ]);
    expect(push).toHaveBeenCalledWith(
      ["u1", "u2"],
      expect.objectContaining({
        title: "تنبيه: رقم في الصندوق لا يتطابق",
        tag: "audit-2026-10-01",
      }),
      { admin },
    );
  });

  it("no rows is not a pass", async () => {
    const { admin, upserts } = fakeAdmin([]);
    const push = vi.fn();
    expect((await runAuditJob(admin, { push, now })).ok).toBe(false);
    expect(upserts[0]).toMatchObject({ ok: false, detail: "no checks ran" });
    expect(push).toHaveBeenCalled();
  });

  it("throws when the audit cannot run (the route records it)", async () => {
    const { admin, upserts } = fakeAdmin(null, { rpcError: "boom" });
    await expect(runAuditJob(admin, { push: vi.fn(), now })).rejects.toThrow("boom");
    expect(upserts).toEqual([]);
  });
});
