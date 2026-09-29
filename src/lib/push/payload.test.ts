import { describe, expect, it } from "vitest";
import { pendingPaymentPayload } from "./payload";

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
});
