import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { CampaignsPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "حملات التبرع · اللجنة", robots: { index: false } };

export default async function Campaigns() {
  const session = await src.committeeSession();
  if (session?.role === "committee") redirect("/committee");
  return (
    <Tab>
      <CampaignsPage campaigns={await src.campaigns()} />
    </Tab>
  );
}
