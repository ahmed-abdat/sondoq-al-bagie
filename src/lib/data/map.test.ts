import { describe, expect, it } from "vitest";
import { toActivityItem, toFundInfo, toFundSummary, toMemberMonth, toPendingPayment } from "./map";

describe("map", () => {
  it("fills an empty fund summary with zeros", () => {
    expect(toFundSummary(null)).toMatchObject({ balance: 0, membersOk: 0, lastActivityAt: null });
  });

  it("defaults fund info when settings are missing", () => {
    expect(toFundInfo(undefined)).toEqual({
      whatsappContact: null,
      graceDays: 10,
      showAmountOwed: false,
    });
  });

  it("keeps known month states and treats unknown ones as upcoming", () => {
    expect(toMemberMonth({ member_id: "m", year: 2026, month: 3, state: "late" }).state).toBe(
      "late",
    );
    expect(toMemberMonth({ member_id: "m", year: 2026, month: 3, state: "weird" }).state).toBe(
      "upcoming",
    );
  });

  it("maps activity kinds and drops unknown ones", () => {
    const base = {
      at: "2026-09-01T10:00:00Z",
      member_names: null,
      months: null,
      amount: null,
      category: null,
    };
    expect(
      toActivityItem({ ...base, kind: "payment_confirmed", member_names: "أ، ب", months: 2 }),
    ).toEqual({
      kind: "payment_confirmed",
      at: base.at,
      memberNames: "أ، ب",
      months: 2,
    });
    expect(
      toActivityItem({ ...base, kind: "expense", amount: 300, category: "sports" }),
    ).toMatchObject({
      kind: "expense",
      amount: 300,
    });
    expect(toActivityItem({ ...base, kind: "something_new" })).toBeNull();
  });

  it("parses payment allocations from the queue view", () => {
    const p = toPendingPayment({
      id: "p1",
      status: "pending",
      payer_name: "دافع",
      method: "bankily",
      amount: 1500,
      paid_on: "2026-09-01",
      txn_ref: null,
      proof_path: null,
      note: null,
      created_at: "2026-09-01T10:00:00Z",
      created_by: null,
      created_by_name: "مشرف",
      decided_at: null,
      decided_by: null,
      decided_by_name: null,
      reject_reason: null,
      cancelled_at: null,
      cancel_reason: null,
      allocations: [
        {
          kind: "months",
          member_id: "m1",
          number: 7,
          full_name: "عضو",
          year: 2026,
          month: 9,
          amount: 1000,
        },
        { kind: "credit", member_id: "m1", number: 7, full_name: "عضو", amount: 500 },
        { kind: "bogus", amount: 1 },
      ],
    });
    expect(p.allocations).toEqual([
      {
        kind: "months",
        memberId: "m1",
        number: 7,
        fullName: "عضو",
        year: 2026,
        month: 9,
        amount: 1000,
      },
      { kind: "credit", memberId: "m1", number: 7, fullName: "عضو", amount: 500 },
    ]);
    expect(p.createdByName).toBe("مشرف");
  });
});
