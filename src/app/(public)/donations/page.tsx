import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { DonationsView } from "@/components/app/views/donations";

export const metadata: Metadata = { title: "التبرعات · صندوق البقيع" };

export default async function DonationsPage() {
  const [campaigns, accounts, info] = await Promise.all([
    src.campaigns(),
    src.fundAccounts(),
    src.fundInfo(),
  ]);
  const open = campaigns.find((c) => c.status === "open") ?? null;
  const contributions = open ? await src.contributions(open.campaignId, 20) : [];
  return (
    <Tab>
      <DonationsView
        campaign={open}
        past={campaigns.filter((c) => c.status === "closed")}
        contributions={contributions}
        accounts={accounts}
        whatsapp={info.whatsappContact}
        // public list: names and dates only, no amounts per person
        showAmounts={false}
      />
    </Tab>
  );
}
