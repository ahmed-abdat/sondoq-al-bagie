import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { AccountsView } from "@/components/app/views/accounts";

export const metadata: Metadata = { title: "الحسابات · صندوق البقيع" };

export default async function AccountsPage() {
  const year = src.thisYear();
  const [summary, accounts, monthly, months, totals, ledger] = await Promise.all([
    src.fundSummary(),
    src.fundAccounts(),
    src.monthly(year),
    src.memberMonths(year),
    src.expenseTotals(),
    src.ledger(),
  ]);
  const payers = Array.from({ length: 12 }, (_, k) => months.filter((m) => m.month === k + 1 && m.state === "paid").length);
  const spentBy = totals
    .filter((t) => t.year === year && t.total > 0)
    .sort((a, b) => b.total - a.total)
    .map(({ category, total }) => ({ category, total }));
  return (
    <Tab>
      <AccountsView
        summary={summary}
        accounts={accounts}
        monthly={monthly}
        payers={payers}
        currentMonth={src.today().getUTCMonth() + 1}
        spentBy={spentBy}
        ledger={ledger}
      />
    </Tab>
  );
}
