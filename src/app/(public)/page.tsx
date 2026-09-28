import { memberCtx, heroData } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { HomeView } from "@/components/app/views/home";
import { MONTHS } from "@/components/app/derive";

export default async function Home() {
  const [hero, members, ctx, ledger, campaigns] = await Promise.all([
    heroData(),
    src.members(),
    memberCtx(),
    src.ledger(),
    src.campaigns(),
  ]);
  const month = src.today().getUTCMonth() + 1;
  const paid = new Set(
    ctx.months.filter((m) => m.month === month && m.state === "paid").map((m) => m.memberId),
  );
  const open = campaigns.find((c) => c.status === "open");
  return (
    <Tab>
      <HomeView
        hero={hero}
        members={members}
        ctx={ctx}
        paidCount={members.filter((m) => m.status === "active" && paid.has(m.memberId)).length}
        monthName={MONTHS[month - 1]}
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
