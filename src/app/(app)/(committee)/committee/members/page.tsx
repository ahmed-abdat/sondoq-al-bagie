import type { Metadata } from "next";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { MembersPage } from "@/components/app/views/committee";

export const metadata: Metadata = { title: "الأعضاء · اللجنة" };

export default async function Members() {
  const session = await src.requireCommittee("/committee/members", { roles: src.MANAGERS });
  const [members, prices] = await Promise.all([src.membersAdmin(), src.groupPrices()]);
  const t = src.today();
  const thisMonth = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
  return (
    <Tab>
      <MembersPage
        members={members}
        prices={prices}
        thisMonth={thisMonth}
        admin={session.role === "admin"}
      />
    </Tab>
  );
}
