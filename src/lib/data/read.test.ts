import { describe, expect, it, vi } from "vitest";
import { DataError, fundInfo, members, verifyReceipt } from "./read";
import type { Client } from "./read";

/** Minimal PostgREST builder stand-in: every chain method returns itself; awaiting gives `res`. */
function fake(res: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => res);
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "order", "limit", "in", "neq"]) b[m] = () => b;
  b.maybeSingle = async () => res;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok);
  return { client: { from: () => b, rpc } as unknown as Client, rpc };
}

describe("read", () => {
  it("maps rows and throws DataError on a database error", async () => {
    const ok = fake({
      data: [{ member_id: "m", number: 1, full_name: "عضو", group_code: "A" }],
      error: null,
    });
    expect((await members(ok.client))[0]).toMatchObject({
      number: 1,
      fullName: "عضو",
      monthsBehind: 0,
    });
    const bad = fake({ data: null, error: { message: "boom", code: "XX000" } });
    await expect(members(bad.client)).rejects.toBeInstanceOf(DataError);
  });

  it("returns defaults for a missing single row", async () => {
    expect(await fundInfo(fake({ data: null, error: null }).client)).toMatchObject({
      graceDays: 10,
    });
  });

  it("does not query for a malformed receipt code", async () => {
    const f = fake({ data: { status: "valid" }, error: null });
    expect(await verifyReceipt(f.client, "hello")).toEqual({ status: "not_found" });
    expect(f.rpc).not.toHaveBeenCalled();
    await verifyReceipt(f.client, " bq-abcd-1234 ");
    expect(f.rpc).toHaveBeenCalledWith("verify_receipt", { p_code: "BQ-ABCD-1234" });
  });
});
