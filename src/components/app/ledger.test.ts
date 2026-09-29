import { describe, expect, it } from "vitest";
import type { ActivityItem, Expense } from "@/lib/data/types";
import { toLedger } from "./ledger";

const now = new Date("2026-09-28T12:00:00Z");
const pay = (id: string, at: string, months: number): ActivityItem => ({
  kind: "payment_confirmed",
  at,
  paymentId: id,
  memberNames: `عضو ${id}`,
  months,
  amount: months ? months * 1000 : 2000,
  method: "bankily",
  receiptCode: `BQ-${id}`,
});
const exp: Expense = {
  id: "x1",
  spentOn: "2026-09-27",
  category: "sports",
  amount: 4500,
  note: null,
  campaignId: null,
};

describe("toLedger", () => {
  it("payments and expenses, newest first; other activity is left out", () => {
    const l = toLedger(
      [
        pay("a", "2026-09-26T10:00:00Z", 3),
        { kind: "campaign_opened", at: "2026-09-28T08:00:00Z", targetAmount: null },
        pay("b", "2026-09-28T09:00:00Z", 0),
      ],
      [exp],
      now,
    );
    expect(l.map((e) => e.id)).toEqual(["p-b", "e-x1", "p-a"]);
  });
  it("wording and kind", () => {
    const [year, some, gift] = toLedger(
      [
        pay("y", "2026-09-28T09:00:00Z", 12),
        pay("s", "2026-09-27T09:00:00Z", 3),
        pay("g", "2026-09-26T09:00:00Z", 0),
      ],
      [],
      now,
    );
    expect(year).toMatchObject({ kind: "payment", sub: "رسوم السنة كاملة", code: "BQ-y" });
    expect(some.kind).toBe("payment");
    expect(some.sub.startsWith("رسوم ")).toBe(true);
    expect(gift).toMatchObject({ kind: "donation", sub: "مساهمة في حملة" });
  });
  it("an expense without a note is titled by its category", () => {
    const [e] = toLedger([], [exp], now);
    expect(e).toMatchObject({
      kind: "expense",
      amount: 4500,
      at: "2026-09-27T12:00:00Z",
      code: null,
    });
    expect(e.title).toBe(e.sub.split(" · ")[0]);
  });
});
