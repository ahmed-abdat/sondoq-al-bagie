import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { SettingsView } from "@/components/app/views/settings";

export const metadata: Metadata = { title: "الإعدادات · صندوق البقيع", robots: { index: false } };

export default async function SettingsPage() {
  const [session, info, accounts, summary] = await Promise.all([
    src.committeeSession(),
    src.fundInfo(),
    src.fundAccountsAdmin(),
    src.fundSummary(),
  ]);
  if (!session) redirect("/login?next=/committee/settings");
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
        openingBalance={summary.openingBalance}
        committee={people}
        members={members.map((m) => ({ memberId: m.memberId, memberRef: m.memberRef }))}
        selfId={session.userId}
        accounts={accounts}
      />
    </Tab>
  );
}
