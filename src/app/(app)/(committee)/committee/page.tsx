import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLE_LABEL } from "@/components/app/derive";
import { memberCtx } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { CommitteeView } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "اللجنة · صندوق الرابطة" };

export default async function CommitteePage({ searchParams }: PageProps<"/committee">) {
  // demo only: try the first sign-in setup
  if (src.demoMode && (await searchParams).setup === "1") redirect("/committee/setup");
  const [session, pending, members, ctx, accounts, arrears, campaigns] = await Promise.all([
    src.requireCommittee("/committee"),
    src.pendingPayments(),
    src.memberRows(),
    memberCtx(),
    src.fundAccounts(),
    src.arrears(),
    src.moneyCampaigns(),
  ]);
  return (
    <Tab>
      <CommitteeView
        pending={pending}
        me={{
          by: session.displayName,
          role: ROLE_LABEL[session.role],
          canConfirm: session.canConfirm,
          memberId: session.memberId,
        }}
        members={members.filter((m) => m.status === "active" || m.status === "exempt")}
        ctx={ctx}
        accounts={accounts}
        campaigns={campaigns}
        lateCount={arrears.length}
        memberCount={members.filter((m) => m.status === "active").length}
        canManage={session.role !== "committee"}
      />
    </Tab>
  );
}
