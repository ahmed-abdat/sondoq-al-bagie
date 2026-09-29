// «كل العمليات»: confirmed payments (from the activity feed) and expenses as one list, newest
// first. Pure. Amounts and receipt codes only when the input carries them (the money path:
// committee or a member); the public, amount-free feed gives amount null and no code.
import type { ActivityItem, Expense, ExpensePublic, PublicActivityItem } from "@/lib/data/types";
import { categoryLabel, monthCount, relativeAgo } from "./derive";
import type { LedgerEntry } from "./types";

type Pay = Extract<ActivityItem | PublicActivityItem, { kind: "payment_confirmed" }>;

export function toLedger(
  acts: (ActivityItem | PublicActivityItem)[],
  exps: (Expense | ExpensePublic)[],
  now: Date,
): LedgerEntry[] {
  const pay = acts
    .filter((a): a is Pay => a.kind === "payment_confirmed")
    .map((a): LedgerEntry => ({
      id: `p-${a.paymentId}`,
      paymentId: a.paymentId,
      kind: a.months > 0 ? "payment" : "donation",
      title: a.memberNames,
      sub:
        a.months >= 12
          ? "رسوم السنة كاملة"
          : a.months > 0
            ? `رسوم ${monthCount(a.months, "obl")}`
            : "مساهمة في حملة",
      amount: "amount" in a ? a.amount : null,
      at: a.at,
      when: relativeAgo(a.at, now),
      method: a.method,
      code: "receiptCode" in a ? a.receiptCode : null,
    }));
  const out = exps.map((e): LedgerEntry => ({
    id: `e-${e.id}`,
    kind: "expense",
    title: e.note ?? categoryLabel(e.category),
    sub: `${categoryLabel(e.category)} · صرفته اللجنة`,
    amount: "amount" in e ? e.amount : null,
    at: `${e.spentOn}T12:00:00Z`,
    when: relativeAgo(`${e.spentOn}T12:00:00Z`, now),
    method: null,
    code: null,
    category: e.category,
    note: e.note,
  }));
  return [...pay, ...out].sort((a, b) => b.at.localeCompare(a.at));
}
