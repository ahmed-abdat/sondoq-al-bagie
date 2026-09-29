import "server-only";
// Page-level bundles shared by several routes (Server Components only).
import { currentDueMonth, dayWords, updatedLabel } from "./derive";
import type { HeroData } from "./hero";
import type { MemberCtx } from "./member";
import * as src from "./source";

export async function heroData(note?: HeroData["note"]): Promise<HeroData> {
  const s = await src.fundSummary();
  const term =
    s.termNumber && s.termStartedOn
      ? // public pages: no committee word «الدورة» (audit V7)
        `منذ ${dayWords(s.termStartedOn)} ${s.termStartedOn.slice(0, 4)}`
      : null;
  return {
    term,
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
  const [info, prices] = await Promise.all([src.fundInfo(), src.groupPrices(year)]);
  return {
    year,
    dueMonth: currentDueMonth(src.today(), info.graceDays),
    prices,
    // the admin switch: when on, the data layer fills amountOwed for everyone
    showOwed: info.showAmountOwed,
  };
}
