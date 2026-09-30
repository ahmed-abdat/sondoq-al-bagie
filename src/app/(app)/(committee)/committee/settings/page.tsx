import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { SettingsView } from "@/components/app/views/settings";
import { BackupCard } from "@/components/app/settings-cards";
import { GroupsSection } from "@/components/app/groups-section";

export const metadata: Metadata = { title: "الإعدادات · صندوق الرابطة" };

export default async function SettingsPage() {
  const [session, accounts, summary, settings] = await Promise.all([
    src.requireCommittee("/committee/settings"),
    src.fundAccountsAdmin(),
    src.committeeSummary(),
    src.fundSettings(),
  ]);
  const admin = session.role === "admin";
  const year = src.thisYear();
  const [groups, backup, people, members] = await Promise.all([
    src.groupsOverview(year),
    admin ? src.backupStatus() : Promise.resolve(null),
    admin ? src.committeeAccounts() : Promise.resolve([]),
    admin ? src.membersAdmin() : Promise.resolve([]),
  ]);
  return (
    <Tab>
      <SettingsView
        role={session.role}
        displayName={session.displayName}
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
      >
        <GroupsSection
          groups={groups}
          year={year}
          admin={admin}
          members={members
            .filter((m) => m.status === "active")
            .map((m) => ({
              memberId: m.memberId,
              memberRef: m.memberRef,
              fullName: m.fullName,
              groupCode: m.groupCode,
            }))}
        />
        {admin && <BackupCard status={backup} />}
      </SettingsView>
    </Tab>
  );
}
