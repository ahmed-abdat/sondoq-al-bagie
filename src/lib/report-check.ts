/**
 * The report grid's month cell (owner decisions r19, r22: like the paper sheet): a green ✓ when
 * the month is paid (early or not), an empty white cell otherwise.
 */
import type { ReportMonthState } from "./data/types";

export function monthPaid(s: ReportMonthState | undefined): boolean {
  return s === "paid" || s === "prepaid";
}
