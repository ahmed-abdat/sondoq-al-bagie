import type { Metadata } from "next";
import { ROLE_LABEL } from "@/components/app/derive";
import { memberCtx } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { CommitteeView } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "اللجنة · صندوق البقيع", robots: { index: false } };

export default async function CommitteePage() {
  const [
    session,
    pending,
    members,
    ctx,
    accounts,
    info,
    arrears,
    expenses,
    campaigns,
    membersAdmin,
  ] = await Promise.all([
    src.committeeSession(),
    src.pendingPayments(),
    src.members(),
    memberCtx(),
    src.fundAccounts(),
    src.fundInfo(),
    src.arrears(),
    src.expensesAdmin(),
    src.campaigns(),
    src.membersAdmin(),
  ]);
  const t = src.today();
  const thisMonth = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  return (
    <Tab>
      <CommitteeView
        pending={pending}
        me={{ by: session?.displayName ?? "", role: session ? ROLE_LABEL[session.role] : "" }}
        members={members.filter((m) => m.status === "active")}
        ctx={ctx}
        accounts={accounts}
        whatsapp={info.whatsappContact}
        arrears={arrears}
        expenses={expenses}
        campaigns={campaigns}
        canCampaign={!!session && session.role !== "committee"}
        membersAdmin={membersAdmin}
        thisMonth={thisMonth}
      />
    </Tab>
  );
}
