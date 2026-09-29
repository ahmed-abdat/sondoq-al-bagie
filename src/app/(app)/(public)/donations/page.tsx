import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { DonationsView } from "@/components/app/views/donations";

export const metadata: Metadata = { title: "التبرعات · صندوق الرابطة" };

export default async function DonationsPage() {
  const [campaigns, accounts, info] = await Promise.all([
    src.campaignsPublic(),
    src.fundAccounts(),
    src.fundInfo(),
  ]);
  const open = campaigns.find((c) => c.status === "open") ?? null;
  // amount-free (money privacy): names and dates only
  const contributions = open ? await src.contributorsPublic(open.campaignId, 20) : [];
  return (
    <Tab>
      <DonationsView
        campaign={open}
        past={campaigns.filter((c) => c.status === "closed" && c.participantsPaid > 0)}
        contributions={contributions}
        accounts={accounts}
        whatsapp={info.whatsappContact}
      />
    </Tab>
  );
}
