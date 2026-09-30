import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLE_LABEL } from "@/components/app/derive";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { CommitteeView } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "دفعات قديمة لم تُثبَّت · صندوق الرابطة" };

export default async function CommitteePage({ searchParams }: PageProps<"/committee">) {
  // demo only: try the first sign-in setup
  const sp = await searchParams;
  if (src.demoMode && sp.setup === "1") redirect("/committee/setup");
  // demo only (QA): ?demoQueue=0|12 shows the empty or a long review list
  const demoQ = src.demoMode && typeof sp.demoQueue === "string" ? sp.demoQueue : undefined;
  const [session, pending, campaigns] = await Promise.all([
    src.requireCommittee("/committee/review"),
    src.pendingPayments(),
    src.moneyCampaigns(),
  ]);
  // old payments waiting for a confirmation: the page goes once none are left
  if (demoQ === undefined && !pending.some((p) => p.status === "pending")) redirect("/committee");
  return (
    <Tab>
      <CommitteeView
        pending={src.demoQueue(pending, demoQ)}
        me={{
          by: session.displayName,
          role: ROLE_LABEL[session.role],
          canConfirm: session.canConfirm,
          memberId: session.memberId,
        }}
        campaigns={campaigns}
      />
    </Tab>
  );
}
