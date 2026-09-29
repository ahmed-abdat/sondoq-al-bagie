import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLE_LABEL } from "@/components/app/derive";
import { memberCtx } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { CommitteeView } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "اللجنة · صندوق الرابطة" };

export default async function CommitteePage() {
  const [session, pending, members, ctx, accounts, arrears, campaigns] = await Promise.all([
    src.committeeSession(),
    src.pendingPayments(),
    src.memberRows(),
    memberCtx(),
    src.fundAccounts(),
    src.arrears(),
    src.campaigns(),
  ]);
  if (!session) redirect("/login?next=/committee");
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
        members={members.filter((m) => m.status === "active" || m.status === "exempt")}
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
