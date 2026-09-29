/**
 * The report grid's month cell (owner decisions r19, r21): a green ✓ badge when the month is paid
 * (early or not); a pale sand cell when an active member owes it (late, or still to come this
 * year); a plain white cell when it is not owed (before joining, exempt, left). Plus the money a
 * group's rows paid this year. Pure and small: used by the /report page and the canvas pages
 * (report-pages.ts), so the page does not pull in the canvas code.
 */
import type { MembershipStatus, ReportMember, ReportMonthState } from "./data/types";

export function monthPaid(s: ReportMonthState | undefined): boolean {
  return s === "paid" || s === "prepaid";
}

export type MonthCell = "paid" | "unpaid" | "none";

export function monthCell(status: MembershipStatus, s: ReportMonthState | undefined): MonthCell {
  if (monthPaid(s)) return "paid";
  return status === "active" && (s === "late" || s === "upcoming") ? "unpaid" : "none";
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
