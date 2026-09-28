import type { Metadata } from "next";
import { ROLE_LABEL } from "@/components/app/derive";
import { memberCtx } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { CommitteeView } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "اللجنة · صندوق البقيع", robots: { index: false } };

export default async function CommitteePage() {
  const [session, pending, members, ctx, accounts, arrears, campaigns] = await Promise.all([
    src.committeeSession(),
    src.pendingPayments(),
    src.members(),
    memberCtx(),
    src.fundAccounts(),
    src.arrears(),
    src.campaigns(),
  ]);
  return (
    <Tab>
      <CommitteeView
        pending={pending}
        me={{
          by: session?.displayName ?? "",
          role: session ? ROLE_LABEL[session.role] : "",
          canConfirm: !!session?.canConfirm,
          memberId: session?.memberId ?? null,
        }}
        members={members.filter((m) => m.status === "active")}
        ctx={ctx}
        accounts={accounts}
        campaigns={campaigns}
        lateCount={arrears.length}
        memberCount={members.filter((m) => m.status === "active").length}
        canManage={!!session && session.role !== "committee"}
      />
    </Tab>
  );
}
