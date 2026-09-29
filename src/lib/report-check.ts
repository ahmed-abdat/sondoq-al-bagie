/**
 * The report grid's month marks and the row ✓ (owner decision, prototype branch
 * proto/report-status variant P/Q). Pure and small: used by the /report page, the share sheet
 * and the canvas pages (report-pages.ts), so the page does not pull in the canvas code.
 */
import type { ReportMember, ReportMonthState } from "./data/types";
import { monthName } from "./dates";

/**
 * What the ✓ at the end of a member row means (owner, chosen in «مشاركة التقرير»):
 * «now» = paid every month due so far this year; «year» = paid every month of the year.
 */
export type CheckMeaning = "now" | "year";
export const CHECK_MEANINGS: readonly CheckMeaning[] = ["now", "year"];

/** One month of the grid: ● paid (early or not), ○ unpaid (due or still to come), blank = not owed. */
export function monthMark(s: ReportMonthState | undefined): "paid" | "unpaid" | null {
  if (s === "paid" || s === "prepaid") return "paid";
  if (s === "late" || s === "upcoming") return "unpaid";
  return null; // before joining, exempt, left
}

/**
 * The row's ✓: someone who paid at least one month this year and nothing the meaning asks is
 * unpaid («now»: no month due so far is late; «year»: no owed month of the year is unpaid).
 * Blank for a row with nothing paid (exempt all year, or joining later this year).
 */
export function rowChecked(m: Pick<ReportMember, "months">, meaning: CheckMeaning): boolean {
  const marks = m.months.map(monthMark);
  if (!marks.includes("paid")) return false;
  return meaning === "year" ? !marks.includes("unpaid") : !m.months.includes("late");
}

/** The legend's ✓ text: «دفع حتى سبتمبر» (month of the report date) or «دفع السنة كاملة». */
export function checkLabel(meaning: CheckMeaning, month: number): string {
  return meaning === "year" ? "دفع السنة كاملة" : `دفع حتى ${monthName(month)}`;
}
