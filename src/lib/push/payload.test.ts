import { describe, expect, it } from "vitest";
import { parsePushPayload } from "@/lib/offline/push-payload";
import {
  cancelPayload,
  expensePayload,
  levyPayload,
  pendingPaymentPayload,
  recordedPaymentPayload,
} from "./payload";

describe("pendingPaymentPayload", () => {
  it("names the payer, the amount and the months once, in order", () => {
    const p = pendingPaymentPayload({
      id: "p1",
      payerName: " أحمد ",
      amount: 3000,
      allocations: [
        { kind: "months", year: 2026, month: 9 },
        { kind: "months", year: 2026, month: 7 },
        { kind: "months", year: 2026, month: 8 },
        { kind: "months", year: 2026, month: 8 },
      ],
    });
    expect(p).toEqual({
      title: "دفعة بانتظار التأكيد",
      body: "أحمد · 3\u202f000 أوقية · يوليو، أغسطس، سبتمبر 2026",
      url: "/committee",
      tag: "pending-p1",
    });
  });

  it("says when money goes to a campaign or to credit", () => {
    const p = pendingPaymentPayload({
      id: "p2",
      payerName: "سيدي",
      amount: 1500,
      allocations: [{ kind: "campaign" }, { kind: "credit" }],
    });
    expect(p.body).toBe("سيدي · 1\u202f500 أوقية · تبرع · رصيد");
  });

  it("round-trips through the service worker parser (wire contract with Lane B)", () => {
    const p = {
      ...pendingPaymentPayload({ id: "p3", payerName: "سيدي", amount: 500, allocations: [] }),
      badgeCount: 4,
    };
    expect(parsePushPayload(JSON.stringify(p))).toEqual(p);
  });
});

describe("committee payloads (m29)", () => {
  it("says who recorded what, and a contribution apart from a payment", () => {
    const pay = recordedPaymentPayload({
      id: "p1",
      actorName: "محمد ولد أحمد",
      payerName: "سيدي",
      amount: 1000,
      allocations: [{ kind: "months", year: 2026, month: 9 }],
    });
    expect(pay).toMatchObject({
      title: "سجّل محمد دفعة",
      url: "/committee/payments",
      tag: "payment-p1",
    });
    expect(pay.body).toContain("سيدي");
    const gift = recordedPaymentPayload({
      id: "p2",
      actorName: null,
      payerName: "متبرع",
      amount: 500,
      allocations: [{ kind: "campaign" }],
    });
    expect(gift.title).toBe("مساهمة جديدة");
  });

  it("expense, cancellation and a new levy", () => {
    expect(expensePayload({ id: "e1", actorName: "أحمد", label: "كرات", amount: 7500 }).title).toBe(
      "سجّل أحمد مصروفًا",
    );
    expect(
      cancelPayload({ id: "p1", actorName: "أحمد", what: "دفعة", reason: " خطأ " }),
    ).toMatchObject({
      title: "ألغى أحمد دفعة",
      body: "خطأ",
    });
    expect(levyPayload({ id: "l1", title: "مساعدة", amount: 2000, members: 21 }).title).toBe(
      "لوحة جديدة: مساعدة",
    );
  });
});
