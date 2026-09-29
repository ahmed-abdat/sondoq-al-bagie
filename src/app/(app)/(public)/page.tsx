import { heroData } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { HomeView } from "@/components/app/views/home";
import { MONTHS } from "@/components/app/derive";

export default async function Home() {
  const [hero, index, ledger, campaigns] = await Promise.all([
    heroData(),
    src.memberIndex(),
    src.ledger(),
    src.campaigns(),
  ]);
  const open = campaigns.find((c) => c.status === "open");
  return (
    <Tab>
      <HomeView
        hero={hero}
        members={index.members.map(({ memberRef, fullName, statusLabel }) => ({
          memberRef,
          fullName,
          statusLabel,
        }))}
        activeCount={index.activeCount}
        paidCount={index.paidThisMonth}
        monthName={MONTHS[(index.month || src.today().getUTCMonth() + 1) - 1]}
        ledger={ledger.slice(0, 3)}
        campaign={
          open
            ? {
                title: open.title,
                pct: open.targetAmount
                  ? Math.min(100, Math.round((open.collected / open.targetAmount) * 100))
                  : 0,
              }
            : null
        }
      />
    </Tab>
  );
}
