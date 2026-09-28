import type { Metadata } from "next";
import { Suspense } from "react";
import { memberCtx } from "@/components/app/page-data";
import * as src from "@/components/app/source";
import { Tab } from "@/components/app/tab";
import { MembersFromUrl, MembersView } from "@/components/app/views/members";

export const metadata: Metadata = { title: "الأعضاء · صندوق البقيع" };

export default async function MembersPage() {
  const [members, ctx] = await Promise.all([src.members(), memberCtx()]);
  return (
    <Tab>
      <Suspense fallback={<MembersView members={members} ctx={ctx} />}>
        <MembersFromUrl members={members} ctx={ctx} />
      </Suspense>
    </Tab>
  );
}
