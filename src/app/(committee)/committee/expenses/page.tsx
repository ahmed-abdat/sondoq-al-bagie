import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { ExpensesPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "المصاريف · صندوق الشباب", robots: { index: false } };

export default async function Expenses() {
  const [expenses, campaigns] = await Promise.all([src.expensesAdmin(), src.campaigns()]);
  return (
    <Tab>
      <ExpensesPage expenses={expenses} campaigns={campaigns} />
    </Tab>
  );
}
