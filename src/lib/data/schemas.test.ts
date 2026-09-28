import { describe, expect, it } from "vitest";
import {
  addFundAccountSchema,
  addMemberSchema,
  recordPaymentSchema,
  updateSettingsSchema,
} from "./schemas";

const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const member = "0f8fad5b-d9cb-469f-a165-70867728950e";

const payment = {
  id,
  payerName: " دافع ",
  method: "bankily" as const,
  amount: 1500,
  paidOn: "2026-09-01",
  allocations: [
    { kind: "months" as const, memberId: member, year: 2026, month: 9, amount: 1000 },
    { kind: "credit" as const, memberId: member, amount: 500 },
  ],
};

describe("schemas", () => {
  it("accepts a split payment and trims text", () => {
    const r = recordPaymentSchema.parse({ ...payment, txnRef: "  ", note: "" });
    expect(r.payerName).toBe("دافع");
    expect(r.txnRef).toBeUndefined();
    expect(r.note).toBeUndefined();
  });

  it("rejects allocations that do not add up", () => {
    const r = recordPaymentSchema.safeParse({ ...payment, amount: 2000 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe("allocations_mismatch");
  });

  it("rejects bad ids, dates and amounts", () => {
    expect(recordPaymentSchema.safeParse({ ...payment, id: "x" }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...payment, paidOn: "01/09/2026" }).success).toBe(false);
    expect(recordPaymentSchema.safeParse({ ...payment, amount: 10.5 }).success).toBe(false);
  });

  it("normalises phones and requires the first of a month", () => {
    const m = addMemberSchema.parse({
      listCode: "b",
      number: 3,
      fullName: "عضو",
      groupCode: "A",
      fromMonth: "2026-01-01",
      phone: "22 33-44 55",
    });
    expect(m.phone).toBe("22334455");
    expect(m.status).toBe("active");
    expect(m.listCode).toBe("B");
    expect(
      addMemberSchema.safeParse({
        listCode: "B",
        number: 4,
        fullName: "x",
        groupCode: "B",
        fromMonth: "2026-01-01",
        status: "away",
      }).success,
    ).toBe(false);
    expect(
      addMemberSchema.safeParse({
        listCode: "B",
        number: 3,
        fullName: "عضو",
        groupCode: "A",
        fromMonth: "2026-01-15",
      }).success,
    ).toBe(false);
  });

  it("accepts Arabic-Indic digits in phones and account numbers", () => {
    expect(updateSettingsSchema.parse({ whatsappContact: "+٢٢٢ ٣٣٣٣ ٤٤٤٤" }).whatsappContact).toBe(
      "+22233334444",
    );
    expect(updateSettingsSchema.parse({ whatsappContact: "۲۲۳۳۳۳۴۴" }).whatsappContact).toBe(
      "22333344",
    );
    expect(
      addFundAccountSchema.parse({
        method: "bankily",
        accountNumber: "٢٢٠٠ ٠٠٠١",
        holderName: "الصندوق",
      }).accountNumber,
    ).toBe("22000001");
  });

  it("lets the WhatsApp contact be cleared with an empty string", () => {
    expect(updateSettingsSchema.parse({ whatsappContact: "" }).whatsappContact).toBe("");
    expect(updateSettingsSchema.parse({ whatsappContact: "+222 3333 4444" }).whatsappContact).toBe(
      "+22233334444",
    );
    expect(updateSettingsSchema.safeParse({ whatsappContact: "abc" }).success).toBe(false);
  });

  it("only takes wallets for fund accounts", () => {
    expect(
      addFundAccountSchema.parse({
        method: "bankily",
        accountNumber: "2222 3333",
        holderName: "الصندوق",
      }).accountNumber,
    ).toBe("22223333");
    const cash = addFundAccountSchema.safeParse({
      method: "cash",
      accountNumber: "22223333",
      holderName: "x",
    });
    expect(cash.error?.issues[0].message).toBe("not_a_wallet");
  });
});
