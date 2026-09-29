import type { Metadata } from "next";
import { heroData } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { AccountsView } from "@/components/app/views/accounts";

export const metadata: Metadata = { title: "الحسابات · صندوق الرابطة" };

export default async function AccountsPage() {
  const year = src.thisYear();
  // amount-free reads only (money privacy): figures arrive in the browser for members/committee
  const [index, accounts, months, ledger, terms, hero, info] = await Promise.all([
    src.memberIndex(),
    src.fundAccounts(),
    src.memberMonths(year),
    src.ledgerPublic(),
    src.termsInfo(),
    heroData(),
    src.fundInfo(),
  ]);
  const payers = Array.from(
    { length: 12 },
    (_, k) => months.filter((m) => m.month === k + 1 && m.state === "paid").length,
  );
  return (
    <Tab>
      <AccountsView
        accounts={accounts}
        payers={payers}
        membersActive={index.activeCount}
        currentMonth={src.today().getUTCMonth() + 1}
        year={year}
        ledger={ledger}
        term={hero.term ?? null}
        pastTerms={terms}
        whatsapp={info.whatsappContact}
      />
    </Tab>
  );
}
