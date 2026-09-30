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
import { WalletsSection, type WalletBalances } from "@/components/app/wallets-section";

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
  const [groups, activities, backup, people, members, wallets, report] = await Promise.all([
    src.groupsOverview(year),
    src.expenseActivities(),
    admin ? src.backupStatus() : Promise.resolve(null),
    admin ? src.committeeAccounts() : Promise.resolve([]),
    admin ? src.membersAdmin() : Promise.resolve([]),
    src.walletTypes(),
    // the balances («المبالغ حسب المحفظة», the server's numbers): only where an opening is set
    src.reportFor({ kind: "wallets", year }).catch(() => null),
  ]);
  const w = report?.kind === "wallets" ? report.data : null;
  const balances: WalletBalances = {
    accounts: Object.fromEntries(
      (w?.wallets ?? []).flatMap((x) =>
        x.fundAccountId && x.balance !== undefined ? [[x.fundAccountId, x.balance]] : [],
      ),
    ),
    cash: w?.cash.balance ?? null,
  };
  return (
    <Tab>
      <SettingsView
        role={session.role}
        displayName={session.displayName}
        openingBalance={settings?.openingBalance ?? summary.openingBalance}
        openingBalanceOn={settings?.openingBalanceOn ?? null}
      >
        <WalletsSection types={wallets} accounts={accounts} balances={balances} admin={admin} />
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
