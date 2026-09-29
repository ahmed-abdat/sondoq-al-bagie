import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { CampaignsPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "حملات التبرع · اللجنة" };

export default async function Campaigns() {
  await src.requireCommittee("/committee/campaigns", { roles: src.MANAGERS });
  const [campaigns, pending] = await Promise.all([src.campaigns(), src.pendingPayments()]);
  return (
    <Tab>
      <CampaignsPage campaigns={campaigns} pending={pending} />
    </Tab>
  );
}
