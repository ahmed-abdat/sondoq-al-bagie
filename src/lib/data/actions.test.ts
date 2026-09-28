import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const updateTag = vi.fn();
let configured = true;

vi.mock("next/cache", () => ({ updateTag: (t: string) => updateTag(t) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => (configured ? { rpc } : null),
}));

const { recordPayment, confirmPayment, rejectPayment, undoPayment, updateSettings } =
  await import("./actions");

const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const member = "0f8fad5b-d9cb-469f-a165-70867728950e";
const payment = {
  id,
  payerName: "دافع",
  method: "sedad" as const,
  amount: 1000,
  paidOn: "2026-09-01",
  allocations: [{ kind: "months" as const, memberId: member, year: 2026, month: 9, amount: 1000 }],
};

beforeEach(() => {
  rpc.mockReset();
  updateTag.mockReset();
  configured = true;
});

describe("actions", () => {
  it("records a payment with snake_case allocations and expires the public cache", async () => {
    rpc.mockResolvedValue({
      data: { id, status: "confirmed", replay: false, already: false },
      error: null,
    });
    const r = await recordPayment(payment);
    expect(r).toEqual({ ok: true, data: { id, status: "confirmed", replay: false } });
    expect(rpc).toHaveBeenCalledWith(
      "record_payment",
      expect.objectContaining({
        p_id: id,
        p_method: "sedad",
        p_allocations: [{ kind: "months", member_id: member, year: 2026, month: 9, amount: 1000 }],
      }),
    );
    expect(updateTag).toHaveBeenCalledWith("public");
  });

  it("returns an Arabic error for an RPC hint and does not expire the cache", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", hint: "month_already_paid", message: "x" },
    });
    const r = await recordPayment(payment);
    expect(r).toMatchObject({ ok: false, code: "month_already_paid" });
    expect(!r.ok && r.message).toMatch(/مدفوع/);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("validates before calling the database", async () => {
    const r = await recordPayment({ ...payment, amount: 500 });
    expect(r).toMatchObject({ ok: false, code: "allocations_mismatch" });
    expect(await rejectPayment({ id, reason: "  " })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports who confirmed first on a double confirmation", async () => {
    rpc.mockResolvedValue({
      data: {
        status: "confirmed",
        already: true,
        decided_by_name: "الأمين",
        decided_at: "2026-09-01T10:00:00Z",
      },
      error: null,
    });
    expect(await confirmPayment({ id })).toEqual({
      ok: true,
      data: { already: true, decidedByName: "الأمين", decidedAt: "2026-09-01T10:00:00Z" },
    });
  });

  it("maps network failures and missing configuration", async () => {
    rpc.mockRejectedValue(new TypeError("fetch failed"));
    expect(await undoPayment({ id })).toMatchObject({ ok: false, code: "network" });
    configured = false;
    expect(await undoPayment({ id })).toMatchObject({ ok: false, code: "not_configured" });
  });

  it("passes only the settings that were given", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await updateSettings({ whatsappContact: "" });
    expect(rpc).toHaveBeenCalledWith("update_settings", {
      p_opening_balance: undefined,
      p_opening_balance_on: undefined,
      p_grace_days: undefined,
      p_show_amount_owed: undefined,
      p_whatsapp_contact: "",
    });
  });
});
