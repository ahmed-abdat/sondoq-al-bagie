import type { Metadata } from "next";
import { memberCtx } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { MembersPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "الأعضاء · اللجنة" };

export default async function Members() {
  const session = await src.requireCommittee("/committee/members", { roles: src.MANAGERS });
  const [members, prices, arrears, links, rows, ctx] = await Promise.all([
    src.membersAdmin(),
    src.groupPrices(),
    src.arrears(),
    src.memberLinks(),
    src.memberRows(),
    memberCtx(),
  ]);
  // each member's months this year, for the sheet's month cells (audit C7)
  const months = Object.fromEntries(rows.map((r) => [r.memberId, r.months]));
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
        links={links}
        months={months}
        monthsCtx={{ year: ctx.year, dueMonth: ctx.dueMonth }}
      />
    </Tab>
  );
}
