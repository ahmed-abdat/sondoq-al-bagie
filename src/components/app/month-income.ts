// Home «المداخيل هذا الشهر» (owner bug): the summary's income counts the paper-sheet import
// (method 'paper', paid_on = the import day), which is not money received this month. The server
// gives that part as `incomePaper` (m44, same filter: confirmed, not credit, by paid_on).
// A missing summary → null: the line is hidden rather than wrong.
export function monthIncome(
  summary: { income: number; incomePaper?: number } | null | undefined,
): number | null {
  if (!summary) return null;
  return summary.income - (summary.incomePaper ?? 0);
}
