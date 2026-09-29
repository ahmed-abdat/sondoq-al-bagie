import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { ExpensesPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "المصاريف · صندوق الرابطة" };

export default async function Expenses() {
  await src.requireCommittee("/committee/expenses");
  const [expenses, campaigns, summary] = await Promise.all([
    src.expensesAdmin(),
    src.moneyCampaigns(),
    src.committeeSummary(),
  ]);
  return (
    <Tab>
      <ExpensesPage expenses={expenses} campaigns={campaigns} balance={summary.balance} />
    </Tab>
  );
}
