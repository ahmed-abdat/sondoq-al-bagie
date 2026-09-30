// Home «المداخيل هذا الشهر» (owner bug): the summary's income counts the paper-sheet import
// (method 'paper', paid_on = the import day), which is not money received this month. Take it
// out with the wallets report of the same month (same filter: confirmed, not credit, by paid_on).
// Either read missing → null: the line is hidden rather than wrong.
export function monthIncome(
  summary: { income: number } | null | undefined,
  wallets: { paperIn?: number } | null | undefined,
): number | null {
  if (!summary || !wallets) return null;
  return summary.income - (wallets.paperIn ?? 0);
}
