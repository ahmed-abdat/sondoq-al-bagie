/**
 * The report grid's month cell (owner decision, r19): a green ✓ badge when the month is paid
 * (early or not), empty otherwise (unpaid, not owed, or still to come). Pure and small: used by
 * the /report page and the canvas pages (report-pages.ts), so the page does not pull in the
 * canvas code.
 */
import type { ReportMonthState } from "./data/types";

export function monthPaid(s: ReportMonthState | undefined): boolean {
  return s === "paid" || s === "prepaid";
}
