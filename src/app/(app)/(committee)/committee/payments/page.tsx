import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { RecentPaymentsPage } from "@/components/app/views/payments";

export const metadata: Metadata = {
  title: "الدفعات الأخيرة · صندوق الرابطة",
};

export default async function Payments() {
  await src.requireCommittee("/committee/payments");
  const [payments, campaigns] = await Promise.all([src.recentPayments(), src.moneyCampaigns()]);
  return (
    <Tab>
      <RecentPaymentsPage
        payments={payments}
        campaignTitles={Object.fromEntries(campaigns.map((c) => [c.campaignId, c.title]))}
      />
    </Tab>
  );
}
