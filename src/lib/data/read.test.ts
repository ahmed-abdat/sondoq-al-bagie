import { describe, expect, it, vi } from "vitest";
import {
  DataError,
  accuracyAudit,
  activityLog,
  expenseActivities,
  fundInfo,
  fundSettings,
  ledgerPublic,
  memberMonths,
  members,
} from "./read";
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
  it("activity log asks for business actions by default, settings on request", async () => {
    const { client, rpc } = fake({ data: [], error: null });
    await activityLog(client);
    expect(rpc).toHaveBeenLastCalledWith("activity_log", {
      p_before: undefined,
      p_limit: 50,
      p_scope: "money",
    });
    await activityLog(client, 10, 20, "settings");
    expect(rpc).toHaveBeenLastCalledWith("activity_log", {
      p_before: 10,
      p_limit: 20,
      p_scope: "settings",
    });
  });

  it("activity log marks only actor-less rows as system, never a nameless member", async () => {
    const base = { at: "2026-09-30T12:00:00Z", action: "update", table_name: "payments" };
    const extra = { row_id: null, subject: null, amount: null, reason: null };
    const { client } = fake({
      data: [
        { id: 1, ...base, ...extra, actor: null, actor_name: null },
        { id: 2, ...base, ...extra, actor: "u1", actor_name: null },
        { id: 3, ...base, ...extra, actor: "u2", actor_name: "أحمد" },
      ],
      error: null,
    });
    const rows = await activityLog(client);
    expect(rows.map((r) => [r.id, r.system, r.actorName])).toEqual([
      [1, true, null],
      [2, false, null],
      [3, false, "أحمد"],
    ]);
  });

  it("maps expense activities in list order", async () => {
    const { client } = fake({
      data: [{ id: 5, name: "رحلة", sort_order: 4, active: false }],
      error: null,
    });
    expect(await expenseActivities(client)).toEqual([
      { id: 5, name: "رحلة", sortOrder: 4, active: false },
    ]);
  });

  it("maps the accuracy audit; a missing ok is not ok", async () => {
    const { client, rpc } = fake({
      data: [
        { check_name: "fund balance", ok: true, detail: "shown 1, recomputed 1" },
        { check_name: "grid", ok: null, detail: null },
      ],
      error: null,
    });
    expect(await accuracyAudit(client)).toEqual([
      { check: "fund balance", ok: true, detail: "shown 1, recomputed 1" },
      { check: "grid", ok: false, detail: "" },
    ]);
    expect(rpc).toHaveBeenCalledWith("accuracy_audit");
  });

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
