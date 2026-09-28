import { describe, expect, it } from "vitest";
import type { PendingPayment } from "@/lib/data/types";
import { fromPending, fromVerified, toShareable, verifyPath } from "./receipt-model";

const pending: PendingPayment = {
  id: "p1",
  status: "pending",
  payerName: "عالي ولد محمد",
  method: "sedad",
  amount: 1500,
  paidOn: "2026-09-28",
  txnRef: "TR20260928391",
  proofPath: "2026/p1.webp",
  note: null,
  createdAt: "2026-09-28T09:40:00Z",
  createdByName: "يحيى",
  decidedAt: null,
  decidedByName: null,
  rejectReason: null,
  cancelReason: null,
  receiptCode: null,
  receiptNo: null,
  allocations: [
    {
      kind: "months",
      memberId: "a",
      number: 7,
      fullName: "عالي ولد محمد",
      year: 2026,
      month: 9,
      amount: 1000,
    },
    {
      kind: "months",
      memberId: "b",
      number: 40,
      fullName: "الداه ولد محمد",
      year: 2026,
      month: 9,
      amount: 500,
    },
  ],
};

describe("receipt model", () => {
  it("builds a pending committee receipt with one cover per member", () => {
    const r = fromPending(pending);
    expect(r.status).toEqual({ kind: "pending" });
    expect(r.covers).toEqual([
      { name: "عالي ولد محمد", year: 2026, months: [9] },
      { name: "الداه ولد محمد", year: 2026, months: [9] },
    ]);
    expect(r.txn).toBe("TR20260928391");
    expect(r.txnLast4).toBe("8391");
    expect(r.no).toBeNull();
  });

  it("maps a rejected payment with its reason", () => {
    const r = fromPending({
      ...pending,
      status: "rejected",
      rejectReason: "رقم العملية مكرر",
      decidedByName: "سيدي محمد",
      decidedAt: "2026-09-28T10:00:00Z",
    });
    expect(r.status).toMatchObject({
      kind: "rejected",
      reason: "رقم العملية مكرر",
      by: "سيدي محمد",
    });
  });

  it("builds a public receipt from verification data", () => {
    expect(fromVerified({ status: "not_found" })).toBeNull();
    const r = fromVerified({
      status: "valid",
      code: "BQ-7F3K-0231",
      receiptNo: "2026-0231",
      payerName: "محمد ولد أحمد",
      amount: 3000,
      method: "bankily",
      paidOn: "2026-09-28",
      confirmedAt: "2026-09-28T09:48:00Z",
      confirmedByName: "سيدي محمد",
      confirmedByRole: "treasurer",
      txnRefLast4: "0452",
      members: [
        {
          number: 1,
          fullName: "محمد ولد أحمد",
          months: [
            { year: 2026, month: 8 },
            { year: 2026, month: 7 },
            { year: 2026, month: 9 },
          ],
        },
      ],
      campaignTitles: [],
    });
    expect(r?.status).toMatchObject({ kind: "confirmed", by: "سيدي محمد", role: "أمين الصندوق" });
    expect(r?.covers[0].months).toEqual([7, 8, 9]);
    expect(r?.txn).toBeNull();
    expect(r?.txnLast4).toBe("0452");
    expect(verifyPath("BQ-7F3K-0231")).toBe("/r/BQ-7F3K-0231");
    const sh = r && toShareable(r);
    expect(sh).toMatchObject({
      no: "2026-0231",
      amountMro: 3000,
      methodLabel: "بنكيلي",
      txnRef: "•••• 0452",
      dateLabel: "الاثنين 28 سبتمبر 2026",
      status: { kind: "confirmed", by: "سيدي محمد", role: "أمين الصندوق" },
    });
    expect(toShareable(fromPending(pending))).toBeNull();
  });
});
