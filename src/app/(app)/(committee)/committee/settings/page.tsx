import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { SettingsView } from "@/components/app/views/settings";
import { BackupCard, CurrentPrices, YearPrices } from "@/components/app/settings-cards";

export const metadata: Metadata = { title: "الإعدادات · صندوق الرابطة" };

export default async function SettingsPage({ searchParams }: PageProps<"/committee/settings">) {
  const [session, info, accounts, summary, settings] = await Promise.all([
    src.requireCommittee("/committee/settings"),
    src.fundInfo(),
    src.fundAccountsAdmin(),
    src.committeeSummary(),
    src.fundSettings(),
  ]);
  const admin = session.role === "admin";
  // «الرسوم الشهرية» of the coming year from 1 December (or this year's when none is set);
  // demo: /committee/settings?prices=1 shows next year's card any day
  const t = src.today();
  const year = t.getUTCFullYear();
  const current = await src.groupPrices(year);
  const demoPrices = src.demoMode && (await searchParams).prices === "1";
  const priceYear = !Object.keys(current).length
    ? year
    : t.getUTCMonth() === 11 || demoPrices
      ? year + 1
      : null;
  const priceSet = priceYear
    ? demoPrices && priceYear === year + 1
      ? {}
      : await src.groupPrices(priceYear)
    : {};
  const groups = Object.keys(current).length ? Object.keys(current).sort() : ["A", "B"];
  const backup = admin ? await src.backupStatus() : null;
  const [people, members] = admin
    ? await Promise.all([src.committeeAccounts(), src.membersAdmin()])
    : [[], []];
  return (
    <Tab>
      <SettingsView
        role={session.role}
        displayName={session.displayName}
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
      >
        {priceYear !== year && <CurrentPrices year={year} prices={current} />}
        {priceYear && (
          <YearPrices
            year={priceYear}
            groups={groups}
            current={current}
            set={priceSet}
            admin={admin}
          />
        )}
        {admin && <BackupCard status={backup} />}
      </SettingsView>
    </Tab>
  );
}
