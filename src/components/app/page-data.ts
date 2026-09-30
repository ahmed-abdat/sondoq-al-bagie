import "server-only";
// Page-level bundles shared by several routes (Server Components only).
import { currentDueMonth } from "./derive";
import type { MemberCtx } from "./member";
import * as src from "./source";

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
