import { describe, expect, it } from "vitest";
import type { PendingPayment } from "@/lib/data/types";
import { fromPending, toShareable, type ReceiptView } from "./receipt-model";

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
      listCode: "A",
      number: 7,
      fullName: "عالي ولد محمد",
      year: 2026,
      month: 9,
      amount: 1000,
    },
    {
      kind: "months",
      memberId: "b",
      listCode: "B",
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
      { name: "عالي ولد محمد", ref: "A-7", year: 2026, months: [9] },
      { name: "الداه ولد محمد", ref: "B-40", year: 2026, months: [9] },
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

  it("a confirmed receipt with a code can be shared (image and text)", () => {
    const r: ReceiptView = {
      no: "2026-0231",
      code: "BQ-7F3K-0231",
      payer: "محمد ولد أحمد",
      covers: [{ name: "محمد ولد أحمد", ref: "A-1", year: 2026, months: [7, 8, 9] }],
      campaigns: [],
      amount: 3000,
      method: "bankily",
      txn: null,
      txnLast4: "0452",
      paidOn: "2026-09-28",
      recordedBy: null,
      recordedAt: null,
      proofPath: null,
      status: {
        kind: "confirmed",
        by: "سيدي محمد",
        role: "أمين الصندوق",
        at: "2026-09-28T09:48:00Z",
      },
    };
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
