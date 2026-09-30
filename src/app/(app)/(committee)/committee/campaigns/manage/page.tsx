import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { CampaignsPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "التبرعات · اللجنة" };

export default async function Campaigns() {
  await src.requireCommittee("/committee/campaigns/manage", { roles: src.MANAGERS });
  const [campaigns, pending] = await Promise.all([src.moneyCampaigns(), src.pendingPayments()]);
  return (
    <Tab>
      <CampaignsPage campaigns={campaigns} pending={pending} />
    </Tab>
  );
}
