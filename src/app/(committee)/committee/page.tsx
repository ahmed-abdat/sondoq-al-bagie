import type { Metadata } from "next";
import { ROLE_LABEL } from "@/components/app/derive";
import { memberCtx } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { CommitteeView } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "اللجنة · صندوق البقيع", robots: { index: false } };

export default async function CommitteePage() {
  const [session, pending, members, ctx, accounts, info] = await Promise.all([
    src.committeeSession(),
    src.pendingPayments(),
    src.members(),
    memberCtx(),
    src.fundAccounts(),
    src.fundInfo(),
  ]);
  return (
    <Tab>
      <CommitteeView
        pending={pending}
        me={{ by: session?.displayName ?? "", role: session ? ROLE_LABEL[session.role] : "" }}
        members={members}
        ctx={ctx}
        accounts={accounts}
        whatsapp={info.whatsappContact}
      />
    </Tab>
  );
}
