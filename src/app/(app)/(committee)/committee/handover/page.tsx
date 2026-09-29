import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { SubHead } from "@/components/app/views/committee";
import { HandoverView } from "@/components/app/handover";

export const metadata: Metadata = { title: "تسليم الصندوق · اللجنة" };

export default async function HandoverPage() {
  const session = await src.committeeSession();
  if (!session || session.role === "committee") redirect("/committee");
  const [handovers, summary, accounts, people] = await Promise.all([
    src.handovers(),
    src.fundSummary(),
    src.fundAccountsAdmin(),
    src.committeeAccounts(),
  ]);
  // the open one (draft or submitted), else the latest for its result
  const open =
    handovers.find((h) => h.status === "draft" || h.status === "submitted") ?? handovers[0] ?? null;
  return (
    <Tab>
      <SubHead title="تسليم الصندوق" lead="للجنة الجديدة عند نهاية الدورة." />
      <HandoverView
        handover={open}
        balance={summary.balance}
        termNumber={summary.termNumber ?? 1}
        accounts={accounts}
        people={people.filter((p) => p.active)}
        me={{ name: session.displayName, admin: session.role === "admin" }}
      />
    </Tab>
  );
}
