import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { RecentPaymentsPage } from "@/components/app/views/payments";

export const metadata: Metadata = {
  title: "الدفعات الأخيرة · صندوق الشباب",
};

export default async function Payments() {
  if (!(await src.committeeSession())) redirect("/login?next=/committee");
  const payments = await src.recentPayments();
  return (
    <Tab>
      <RecentPaymentsPage payments={payments} />
    </Tab>
  );
}
