import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { RecentPaymentsPage } from "@/components/app/views/payments";

export const metadata: Metadata = {
  title: "الدفعات الأخيرة · صندوق الرابطة",
};

export default async function Payments() {
  await src.requireCommittee("/committee/payments");
  const payments = await src.recentPayments();
  return (
    <Tab>
      <RecentPaymentsPage payments={payments} />
    </Tab>
  );
}
