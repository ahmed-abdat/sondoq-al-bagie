import type { Metadata } from "next";
import { Suspense } from "react";
import { memberCtx } from "@/components/app/page-data";
import { isGone } from "@/components/app/derive";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { MembersFromUrl, MembersView } from "@/components/app/views/members";

export const metadata: Metadata = { title: "الأعضاء · صندوق البقيع" };

export default async function MembersPage() {
  const [all, ctx] = await Promise.all([src.members(), memberCtx()]);
  // left / deceased members are hidden from public lists
  const members = all.filter((m) => !isGone(m.status));
  return (
    <Tab>
      <Suspense fallback={<MembersView members={members} ctx={ctx} />}>
        <MembersFromUrl members={members} ctx={ctx} />
      </Suspense>
    </Tab>
  );
}
