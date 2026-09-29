// «كل العمليات»: confirmed payments (from the activity feed) and expenses as one list, newest
// first. Pure; source.ts adds the receipts.
import type { ActivityItem, Expense } from "@/lib/data/types";
import { categoryLabel, monthCount, relativeAgo } from "./derive";
import type { LedgerEntry } from "./types";

export function toLedger(acts: ActivityItem[], exps: Expense[], now: Date): LedgerEntry[] {
  const pay = acts
    .filter(
      (a): a is Extract<ActivityItem, { kind: "payment_confirmed" }> =>
        a.kind === "payment_confirmed",
    )
    .map((a): LedgerEntry => ({
      id: `p-${a.paymentId}`,
      paymentId: a.paymentId,
      kind: a.months > 0 ? "payment" : "donation",
      title: a.memberNames,
      sub:
        a.months >= 12
          ? "رسوم السنة كاملة"
          : a.months > 0
            ? `رسوم ${monthCount(a.months)}`
            : "مساهمة في حملة",
      amount: a.amount,
      at: a.at,
      when: relativeAgo(a.at, now),
      method: a.method,
      code: a.receiptCode,
    }));
  const out = exps.map((e): LedgerEntry => ({
    id: `e-${e.id}`,
    kind: "expense",
    title: e.note ?? categoryLabel(e.category),
    sub: `${categoryLabel(e.category)} · صرفته اللجنة`,
    amount: e.amount,
    at: `${e.spentOn}T12:00:00Z`,
    when: relativeAgo(`${e.spentOn}T12:00:00Z`, now),
    method: null,
    code: null,
    category: e.category,
    note: e.note,
  }));
  return [...pay, ...out].sort((a, b) => b.at.localeCompare(a.at));
}
