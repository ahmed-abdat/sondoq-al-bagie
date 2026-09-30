import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import {
  CommitteeSection,
  HandoverSection,
  InstallSection,
  SettingsView,
} from "@/components/app/views/settings";
import { BackupCard } from "@/components/app/settings-cards";
import { GroupsSection } from "@/components/app/groups-section";
import { ActivitiesSection } from "@/components/app/activities-section";

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
  const [groups, activities, backup, people, members] = await Promise.all([
    src.groupsOverview(year),
    src.expenseActivities(),
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
        <ActivitiesSection activities={activities} admin={admin} />
        {admin && (
          <CommitteeSection
            committee={people}
            members={members.map((m) => ({
              memberId: m.memberId,
              memberRef: m.memberRef,
              fullName: m.fullName,
              status: m.status,
            }))}
            selfId={session.userId}
          />
        )}
        {admin && <HandoverSection />}
        {admin && <BackupCard status={backup} />}
        <InstallSection />
      </SettingsView>
    </Tab>
  );
}
