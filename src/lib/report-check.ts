/**
 * The report grid's month cell (owner decisions r19, r22: like the paper sheet): a green ✓ when
 * the month is paid (early or not), an empty white cell otherwise. Plus the money a group's rows
 * paid this year («المجموع»). Pure and small: used by the /report page and the canvas pages
 * (report-pages.ts), so the page does not pull in the canvas code.
 */
import type { ReportMember, ReportMonthState } from "./data/types";

export function monthPaid(s: ReportMonthState | undefined): boolean {
  return s === "paid" || s === "prepaid";
}

/** «المجموع» under a group: paid months × the member's group fee, MRO. */
export function paidTotal(
  members: Pick<ReportMember, "groupCode" | "months">[],
  prices: Partial<Record<string, number>>,
): number {
  return members.reduce(
    (sum, m) => sum + m.months.filter(monthPaid).length * (prices[m.groupCode] ?? 0),
    0,
  );
}
