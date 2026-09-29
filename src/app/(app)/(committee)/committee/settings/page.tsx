import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { SettingsView } from "@/components/app/views/settings";

export const metadata: Metadata = { title: "الإعدادات · صندوق الرابطة" };

export default async function SettingsPage() {
  const [session, info, accounts, summary, settings] = await Promise.all([
    src.requireCommittee("/committee/settings"),
    src.fundInfo(),
    src.fundAccountsAdmin(),
    src.fundSummary(),
    src.fundSettings(),
  ]);
  const admin = session.role === "admin";
  const [people, members] = admin
    ? await Promise.all([src.committeeAccounts(), src.membersAdmin()])
    : [[], []];
  return (
    <Tab>
      <SettingsView
        role={session.role}
        displayName={session.displayName}
        showOwed={info.showAmountOwed}
        whatsapp={info.whatsappContact}
        openingBalance={settings?.openingBalance ?? summary.openingBalance}
        openingBalanceOn={settings?.openingBalanceOn ?? null}
        committee={people}
        members={members.map((m) => ({
          memberId: m.memberId,
          memberRef: m.memberRef,
          fullName: m.fullName,
          status: m.status,
        }))}
        selfId={session.userId}
        accounts={accounts}
      />
    </Tab>
  );
}
