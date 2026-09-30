import { describe, expect, it, vi } from "vitest";
import { DataError, fundInfo, fundSettings, ledgerPublic, memberMonths, members } from "./read";
import type { Client } from "./read";

/** Minimal PostgREST builder stand-in: every chain method returns itself; awaiting gives `res`. */
function fake(res: { data: unknown; error: unknown }) {
  const rpc = vi.fn(async () => res);
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gt", "order", "limit", "in", "neq"]) b[m] = () => b;
  b.maybeSingle = async () => res;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve(res).then(ok);
  return { client: { from: () => b, rpc } as unknown as Client, rpc };
}

describe("read", () => {
  it("reads the month grid page by page past the 1000-row API limit", async () => {
    const row = { member_id: "m", year: 2026, month: 1, state: "paid" };
    const range = vi.fn(async (from: number) => ({
      data: Array.from({ length: from === 0 ? 1000 : 92 }, () => row),
      error: null,
    }));
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order"]) b[m] = () => b;
    b.range = range;
    const client = { from: () => b } as unknown as Client;
    expect(await memberMonths(client, 2026)).toHaveLength(1092);
    expect(range.mock.calls.map((c) => c.slice(0, 2))).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

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

  it("reads a short amount-free ledger: confirmed payments only, both lists limited", async () => {
    const calls: [string, string, unknown[]][] = [];
    const rows: Record<string, unknown[]> = {
      activity_public: [
        {
          at: "2026-09-29T10:00:00Z",
          kind: "payment_confirmed",
          member_names: "عضو",
          months: 1,
          payment_id: "p1",
          method: "bankily",
        },
      ],
      expenses_public: [
        { id: "e1", spent_on: "2026-09-28", category: "sports", note: null, campaign_id: null },
      ],
    };
    const client = {
      from: (t: string) => {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "limit"])
          b[m] = (...a: unknown[]) => (calls.push([t, m, a]), b);
        b.then = (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: rows[t], error: null }).then(ok);
        return b;
      },
    } as unknown as Client;
    const r = await ledgerPublic(client, 3);
    expect(r.activity).toHaveLength(1);
    expect(r.expenses[0]).toMatchObject({ id: "e1", spentOn: "2026-09-28" });
    expect(JSON.stringify(r)).not.toMatch(/"amount"|receiptCode/);
    expect(calls).toContainEqual(["activity_public", "eq", ["kind", "payment_confirmed"]]);
    expect(calls).toContainEqual(["activity_public", "limit", [3]]);
    expect(calls).toContainEqual(["expenses_public", "limit", [3]]);
  });

  it("reads the settings row with the opening balance date", async () => {
    const row = {
      whatsapp_contact: null,
      grace_days: 10,
      show_amount_owed: false,
      opening_balance: 229000,
      opening_balance_on: "2026-01-01",
    };
    expect(await fundSettings(fake({ data: row, error: null }).client)).toEqual({
      whatsappContact: null,
      graceDays: 10,
      showAmountOwed: false,
      openingBalance: 229000,
      openingBalanceOn: "2026-01-01",
    });
    expect(await fundSettings(fake({ data: null, error: null }).client)).toBeNull();
  });
});
