import { describe, expect, it } from "vitest";
import {
  toHandover,
  toTerm,
  toActivityItem,
  toFundInfo,
  toFundSummary,
  toMemberMonth,
  toPendingPayment,
  toVerifiedReceipt,
} from "./map";

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
    const row = { member_id: "m", year: 2026, month: 3, price: 1000 };
    expect(toMemberMonth({ ...row, state: "late" })).toMatchObject({ state: "late", price: 1000 });
    expect(toMemberMonth({ ...row, state: "weird", price: null })).toMatchObject({
      state: "upcoming",
      price: null,
    });
  });

  it("maps activity kinds and drops unknown ones", () => {
    const base = {
      at: "2026-09-01T10:00:00Z",
      member_names: null,
      months: null,
      amount: null,
      category: null,
      payment_id: null,
      method: null,
      receipt_code: null,
    };
    expect(
      toActivityItem({
        ...base,
        kind: "payment_confirmed",
        member_names: "أ، ب",
        months: 2,
        amount: 2000,
        payment_id: "p1",
        method: "bankily",
        receipt_code: "BQ-ABCD-1234",
      }),
    ).toEqual({
      kind: "payment_confirmed",
      at: base.at,
      paymentId: "p1",
      memberNames: "أ، ب",
      months: 2,
      amount: 2000,
      method: "bankily",
      receiptCode: "BQ-ABCD-1234",
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
      receipt_code: null,
      receipt_no: null,
      allocations: [
        {
          kind: "months",
          member_id: "m1",
          list_code: "B",
          number: 7,
          full_name: "عضو",
          year: 2026,
          month: 9,
          amount: 1000,
        },
        {
          kind: "credit",
          member_id: "m1",
          list_code: "B",
          number: 7,
          full_name: "عضو",
          amount: 500,
        },
        { kind: "bogus", amount: 1 },
      ],
    });
    expect(p.allocations).toEqual([
      {
        kind: "months",
        memberId: "m1",
        listCode: "B",
        number: 7,
        fullName: "عضو",
        year: 2026,
        month: 9,
        amount: 1000,
      },
      { kind: "credit", memberId: "m1", listCode: "B", number: 7, fullName: "عضو", amount: 500 },
    ]);
    expect(p.createdByName).toBe("مشرف");
  });

  it("reads verify_receipt JSON and treats anything odd as not found", () => {
    expect(toVerifiedReceipt({ status: "not_found" })).toEqual({ status: "not_found" });
    expect(toVerifiedReceipt(null)).toEqual({ status: "not_found" });
    const r = toVerifiedReceipt({
      status: "valid",
      code: "BQ-ABCD-1234",
      receipt_no: "2026-0001",
      payer_name: "دافع",
      amount: 1000,
      method: "sedad",
      paid_on: "2026-09-01",
      confirmed_at: "2026-09-01T10:00:00Z",
      confirmed_by_name: "الأمين",
      confirmed_by_role: "treasurer",
      txn_ref_last4: "1234",
      members: [
        { list_code: "B", number: 7, full_name: "عضو", months: [{ year: 2026, month: 9 }] },
      ],
      campaign_titles: [],
    });
    expect(r).toMatchObject({
      status: "valid",
      receiptNo: "2026-0001",
      confirmedByRole: "treasurer",
      txnRefLast4: "1234",
    });
    expect(r.status === "valid" && r.members[0]).toEqual({
      listCode: "B",
      number: 7,
      fullName: "عضو",
      months: [{ year: 2026, month: 9 }],
    });
  });

  it("maps terms and handovers", () => {
    expect(
      toTerm({
        number: 2,
        title: null,
        started_on: "2027-01-01",
        ended_on: null,
        opening_balance: 280000,
        closing_balance: null,
        collected: 1000,
        spent: 0,
        adjustment: 0,
      }),
    ).toMatchObject({ number: 2, title: "الدورة 2", endedOn: null, openingBalance: 280000 });
    const h = toHandover({
      id: "h",
      from_term: 1,
      to_term: null,
      status: "submitted",
      counted_lines: [{ label: "نقداً", method: "cash", account_id: null, amount: 700 }],
      counted_balance: 700,
      computed_balance: 1200,
      difference: null,
      carry_over: ["u1"],
      note: null,
      started_at: "2026-12-31T10:00:00Z",
      started_by_name: "الأمين",
      submitted_at: "2026-12-31T11:00:00Z",
      submitted_by_name: "الأمين",
      accepted_at: null,
      accepted_by_name: null,
      cancelled_at: null,
      cancel_reason: null,
      live_balance: 1200,
    });
    expect(h.countedLines).toEqual([
      { label: "نقداً", method: "cash", accountId: null, amount: 700 },
    ]);
    expect(h).toMatchObject({ status: "submitted", liveBalance: 1200, carryOver: ["u1"] });
  });

  it("maps the handover difference in the activity feed", () => {
    expect(
      toActivityItem({
        at: "2027-01-01T00:00:00Z",
        kind: "balance_adjustment",
        member_names: null,
        months: null,
        amount: -500,
        category: null,
        payment_id: null,
        method: null,
        receipt_code: null,
      }),
    ).toEqual({ kind: "balance_adjustment", at: "2027-01-01T00:00:00Z", amount: -500 });
  });
});
