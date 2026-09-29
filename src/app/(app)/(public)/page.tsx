import { heroData } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { HomeView } from "@/components/app/views/home";
import { MONTHS } from "@/components/app/derive";

export default async function Home() {
  // amount-free reads only (money privacy): figures arrive in the browser for members/committee
  const [hero, index, all, ledger, campaigns] = await Promise.all([
    heroData(),
    src.memberIndex(),
    src.members(),
    src.ledgerRecent(3),
    src.campaignsPublic(),
  ]);
  // the same status word as /members (audit V2): computed from the months, not the view's label
  const byRef = new Map(all.map((m) => [m.memberRef, m]));
  const open = campaigns.find((c) => c.status === "open");
  return (
    <Tab>
      <HomeView
        hero={hero}
        members={index.members.flatMap(({ memberRef, fullName }) => {
          const m = byRef.get(memberRef);
          return m
            ? [
                {
                  memberRef,
                  fullName,
                  status: m.status,
                  monthsBehind: m.monthsBehind,
                  monthsPaidThisYear: m.monthsPaidThisYear,
                },
              ]
            : [];
        })}
        activeCount={index.activeCount}
        paidCount={index.paidThisMonth}
        monthName={MONTHS[(index.month || src.today().getUTCMonth() + 1) - 1]}
        ledger={ledger}
        campaign={open ? { campaignId: open.campaignId, title: open.title } : null}
      />
    </Tab>
  );
}
