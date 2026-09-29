import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { ExpensesPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "المصاريف · صندوق الشباب" };

export default async function Expenses() {
  if (!(await src.committeeSession())) redirect("/login?next=/committee");
  const [expenses, campaigns] = await Promise.all([src.expensesAdmin(), src.campaigns()]);
  return (
    <Tab>
      <ExpensesPage expenses={expenses} campaigns={campaigns} />
    </Tab>
  );
}
