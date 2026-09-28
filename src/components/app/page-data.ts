import "server-only";
// Page-level bundles shared by several routes (Server Components only).
import { currentDueMonth, updatedLabel } from "./derive";
import type { HeroData } from "./hero";
import type { MemberCtx } from "./member";
import * as src from "./source";

export async function heroData(note?: HeroData["note"]): Promise<HeroData> {
  const s = await src.fundSummary();
  return {
    balance: s.balance,
    collected: s.collectedThisYear,
    spent: s.spentThisYear,
    note:
      note ??
      (s.lastActivityAt
        ? `آخر تحديث: ${updatedLabel(s.lastActivityAt, src.today())}`
        : "لم تُسجَّل عمليات بعد"),
  };
}

export async function memberCtx(): Promise<MemberCtx> {
  const year = src.thisYear();
  const [months, info] = await Promise.all([src.memberMonths(year), src.fundInfo()]);
  return {
    months,
    year,
    dueMonth: currentDueMonth(src.today(), info.graceDays),
    prices: src.groupPrices(),
    // the admin switch: when on, the data layer fills amountOwed for everyone
    showOwed: info.showAmountOwed,
  };
}
