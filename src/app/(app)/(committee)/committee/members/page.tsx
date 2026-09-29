import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { MembersPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "الأعضاء · اللجنة" };

export default async function Members() {
  const session = await src.requireCommittee("/committee/members", { roles: src.MANAGERS });
  const [members, prices, arrears] = await Promise.all([
    src.membersAdmin(),
    src.groupPrices(),
    src.arrears(),
  ]);
  // credit and the late months it can pay, per member (only members who have some)
  const credit = Object.fromEntries(
    arrears
      .filter((a) => a.credit > 0)
      .map((a) => [a.memberId, { amount: a.credit, months: a.months }]),
  );
  const t = src.today();
  const thisMonth = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  return (
    <Tab>
      <MembersPage
        members={members}
        prices={prices}
        thisMonth={thisMonth}
        admin={session.role === "admin"}
        credit={credit}
      />
    </Tab>
  );
}
